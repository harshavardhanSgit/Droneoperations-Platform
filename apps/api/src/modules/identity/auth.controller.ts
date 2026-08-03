import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { Env } from '../../config/env.validation';
import type { ActorContext } from './actor-context';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { RefreshResponseDto } from './dto/refresh-response.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { TokenService } from './token.service';

export const REFRESH_COOKIE = 'refresh_token';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a user, an organisation and an OWNER membership. Omit organisationName for an individual account.',
  })
  @ApiEnvelope(RegisterResponseDto, {
    status: HttpStatus.CREATED,
    description: 'Account created',
  })
  @ApiErrorEnvelope(HttpStatus.BAD_REQUEST, 'Validation failed')
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Email already registered')
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description:
      'Returns a short-lived access token in the body and sets a long-lived, httpOnly refresh cookie.',
  })
  @ApiEnvelope(LoginResponseDto, { description: 'Authenticated' })
  @ApiErrorEnvelope(HttpStatus.UNAUTHORIZED, 'Invalid email or password')
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Account or organisation suspended')
  async login(
    @Body() dto: LoginDto,
    // passthrough: true lets us touch the response (to set a cookie) while Nest
    // still serialises the return value through the response interceptor.
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const { body, refreshToken } = await this.auth.login(dto);

    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());

    return body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the session',
    description:
      'Reads the refresh cookie, revokes it, issues a replacement, and returns a new access token. Presenting an already-used token revokes the whole session family.',
  })
  @ApiEnvelope(RefreshResponseDto, { description: 'Session rotated' })
  @ApiErrorEnvelope(HttpStatus.UNAUTHORIZED, 'Missing, invalid, expired or revoked session')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponseDto> {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE];

    const { body, refreshToken } = await this.auth.refresh(
      typeof presented === 'string' ? presented : undefined,
    );

    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions());

    return body;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the presented refresh token and clears the cookie. Other devices stay signed in. Always succeeds.',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented: unknown = req.cookies?.[REFRESH_COOKIE];

    await this.auth.logout(typeof presented === 'string' ? presented : undefined);

    // Same path/flags as when it was set — a mismatch leaves a stale cookie
    // in the browser that the server has already revoked.
    res.clearCookie(REFRESH_COOKIE, { ...this.refreshCookieOptions(), maxAge: undefined });
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Current account',
    description: 'Requires a valid access token. Returns the acting user, their organisation and role.',
  })
  @ApiEnvelope(MeResponseDto, { description: 'Current account' })
  @ApiErrorEnvelope(HttpStatus.UNAUTHORIZED, 'Missing, invalid or expired access token')
  me(@CurrentUser() actor: ActorContext): Promise<MeResponseDto> {
    return this.auth.me(actor);
  }

  private refreshCookieOptions(): CookieOptions {
    return {
      // Unreadable from JavaScript, so XSS cannot exfiltrate it.
      httpOnly: true,
      // HTTPS only in production; must stay false locally or the browser drops it.
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      // Not sent on cross-site requests, which blocks the basic CSRF shape.
      sameSite: 'lax',
      // Scoped: the browser only attaches it to auth routes, so it is absent
      // from every ordinary API call and cannot leak through them.
      path: '/api/v1/auth',
      maxAge: this.tokens.refreshTokenTtlMs(),
    };
  }
}
