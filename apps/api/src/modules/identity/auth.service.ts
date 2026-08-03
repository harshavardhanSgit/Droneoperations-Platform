import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import {
  AccessDeniedException,
  ResourceConflictException,
  UnauthenticatedException,
} from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ActorContext } from './actor-context';
import type { MeResponseDto } from './dto/me-response.dto';
import type { RefreshResponseDto } from './dto/refresh-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { LoginResponseDto } from './dto/login-response.dto';
import type { RegisterDto } from './dto/register.dto';
import type { RegisterResponseDto } from './dto/register-response.dto';
import { PasswordService } from './password.service';
import { OrganisationRepository } from '../organisations/organisation.repository';
import { ProviderRepository } from '../organisations/provider.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { TokenService } from './token.service';

const UNIQUE_VIOLATION = 'P2002';

/** What login hands back to the controller. The refresh token goes in a cookie,
 *  so it is kept out of the response body DTO entirely. */
export interface LoginResult {
  body: LoginResponseDto;
  refreshToken: string;
}

export interface RefreshResult {
  body: RefreshResponseDto;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private dummyHash: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly organisations: OrganisationRepository,
    private readonly providerProfiles: ProviderRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly logger: Logger,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const organisationName = dto.organisationName?.trim();

    if (await this.users.findByEmail(email)) {
      throw this.emailTaken();
    }

    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const { user, organisation, membership } = await this.prisma.$transaction(async (tx) => {
        const user = await this.users.create(
          { email, passwordHash, fullName, phone: dto.phone?.trim() },
          tx,
        );

        const organisation = await this.organisations.create(
          {
            name: organisationName ?? fullName,
            kind: dto.accountType,
            type: organisationName ? 'BUSINESS' : 'INDIVIDUAL',
          },
          tx,
        );

        const membership = await this.organisations.addMembership(
          { userId: user.id, organisationId: organisation.id, role: 'OWNER' },
          tx,
        );

        // A PROVIDER organisation is meaningless without its onboarding record,
        // so it is created here rather than lazily. Same transaction, same
        // documented account-provisioning exception.
        if (organisation.kind === 'PROVIDER') {
          await this.providerProfiles.create(organisation.id, tx);
        }

        return { user, organisation, membership };
      });

      return {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        organisation: {
          id: organisation.id,
          name: organisation.name,
          kind: organisation.kind,
          type: organisation.type,
        },
        role: membership.role,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw this.emailTaken();
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    // No user: still run a verify against a throwaway hash so the response time
    // matches the "wrong password" path. Without this, timing reveals which
    // emails have accounts even though the message does not.
    if (!user) {
      await this.passwords.verify(await this.getDummyHash(), dto.password);
      throw this.invalidCredentials();
    }

    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      throw this.invalidCredentials();
    }

    // Distinct message here is deliberate: a suspended user has already proved
    // who they are, and telling them nothing would just generate support load.
    if (user.status !== 'ACTIVE') {
      throw new AccessDeniedException('This account has been suspended');
    }

    const memberships = await this.organisations.findActiveMemberships(user.id);
    const membership = memberships[0];

    if (!membership) {
      throw new AccessDeniedException('This account has no active organisation');
    }

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      oid: membership.organisationId,
      mid: membership.id,
      kind: membership.organisation.kind,
      role: membership.role,
    });

    const refresh = this.tokens.issueRefreshToken();

    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      familyId: refresh.familyId,
      expiresAt: refresh.expiresAt,
    });

    return {
      refreshToken: refresh.token,
      body: {
        accessToken,
        expiresIn: this.tokens.accessTokenTtlSeconds(),
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        organisation: {
          id: membership.organisation.id,
          name: membership.organisation.name,
          kind: membership.organisation.kind,
          type: membership.organisation.type,
        },
        role: membership.role,
      },
    };
  }

  /**
   * Exchanges a refresh token for a new access token and a NEW refresh token.
   *
   * The old token is revoked in the same transaction that issues its
   * replacement, so a token can only ever be spent once.
   */
  async refresh(presentedToken: string | undefined): Promise<RefreshResult> {
    if (!presentedToken) {
      throw new UnauthenticatedException('No refresh token provided', 'NO_REFRESH_TOKEN');
    }

    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);

    if (!stored) {
      throw new UnauthenticatedException('Invalid refresh token', 'SESSION_INVALID');
    }

    // REUSE DETECTED. A legitimate client never presents a token it has already
    // exchanged, so this means a copy exists somewhere. Kill every descendant
    // of that login — the attacker's session and the victim's alike.
    if (stored.revokedAt) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      this.logger.warn(
        { userId: stored.userId, familyId: stored.familyId },
        'Refresh token reuse detected — family revoked',
      );
      throw new UnauthenticatedException(
        'This session has been revoked. Please sign in again.',
        'SESSION_REVOKED',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthenticatedException('Session expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    const user = await this.users.findById(stored.userId);

    if (!user || user.status !== 'ACTIVE') {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new AccessDeniedException('This account is no longer active');
    }

    const membership = (await this.organisations.findActiveMemberships(user.id))[0];

    if (!membership) {
      await this.refreshTokens.revokeFamily(stored.familyId);
      throw new AccessDeniedException('This account has no active organisation');
    }

    const rotated = this.tokens.issueRefreshToken(stored.familyId);

    await this.prisma.$transaction(async (tx) => {
      // Conditional revoke: the WHERE clause includes `revokedAt: null`, so if
      // a concurrent request rotated this token first, count is 0 and we know
      // we lost the race rather than silently issuing a second child.
      const revoked = await this.refreshTokens.revokeByHash(tokenHash, tx);

      if (revoked.count === 0) {
        throw new UnauthenticatedException(
          'This session has been revoked. Please sign in again.',
          'SESSION_REVOKED',
        );
      }

      await this.refreshTokens.create(
        {
          userId: user.id,
          tokenHash: rotated.tokenHash,
          familyId: rotated.familyId,
          expiresAt: rotated.expiresAt,
        },
        tx,
      );
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      oid: membership.organisationId,
      mid: membership.id,
      kind: membership.organisation.kind,
      role: membership.role,
    });

    return {
      refreshToken: rotated.token,
      body: { accessToken, expiresIn: this.tokens.accessTokenTtlSeconds() },
    };
  }

  /**
   * Revokes only the presented token, not the family — signing out on your
   * phone must not sign you out on your laptop.
   *
   * Never errors on an unknown or absent token: logout must always appear to
   * succeed, or it becomes a probe for which tokens are valid.
   */
  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) {
      return;
    }

    await this.refreshTokens.revokeByHash(this.tokens.hashRefreshToken(presentedToken));
  }

  /**
   * The token already proves who the actor is, so this only fetches the
   * mutable profile fields a token should not carry (name, email, phone) —
   * those change, and a stale token must not be the source of truth for them.
   */
  async me(actor: ActorContext): Promise<MeResponseDto> {
    const user = await this.users.findById(actor.userId);

    if (!user) {
      throw new UnauthenticatedException('Account no longer exists');
    }

    const membership = (await this.organisations.findActiveMemberships(user.id)).find(
      (candidate) => candidate.id === actor.membershipId,
    );

    if (!membership) {
      throw new AccessDeniedException('This membership is no longer active');
    }

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      ...(user.phone ? { phone: user.phone } : {}),
      organisation: {
        id: membership.organisation.id,
        name: membership.organisation.name,
        kind: membership.organisation.kind,
        type: membership.organisation.type,
      },
      role: membership.role,
    };
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await this.passwords.hash(randomBytes(32).toString('hex'));
    return this.dummyHash;
  }

  private emailTaken(): ResourceConflictException {
    return new ResourceConflictException(
      'EMAIL_ALREADY_REGISTERED',
      'An account with this email address already exists',
    );
  }

  /** One message for both "no such user" and "wrong password". */
  private invalidCredentials(): UnauthenticatedException {
    return new UnauthenticatedException('Invalid email or password');
  }
}
