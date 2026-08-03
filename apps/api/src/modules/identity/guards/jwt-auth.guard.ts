import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { UnauthenticatedException } from '../../../common/errors/app.exception';
import type { ActorContext } from '../actor-context';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    // getAllAndOverride checks the handler first, then the class, so @Public()
    // on a single method beats the controller and vice versa.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return isPublic ? true : super.canActivate(context);
  }

  /**
   * Passport's default is to throw its own UnauthorizedException, which would
   * bypass our error envelope. Overriding lets us emit a stable machine code
   * the frontend can act on.
   */
  override handleRequest<T = ActorContext>(err: unknown, user: T, info: unknown): T {
    if (err || !user) {
      const reason = (info as { name?: string } | undefined)?.name;

      if (reason === 'TokenExpiredError') {
        throw new UnauthenticatedException('Access token has expired', 'TOKEN_EXPIRED');
      }

      throw new UnauthenticatedException('Authentication required');
    }

    return user;
  }
}
