import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../../config/env.validation';
import type { MembershipRole, OrganisationKind } from '../../generated/prisma/client';

/**
 * Claims carried by the access token. Enough for the guard to build a full
 * actor context without touching the database.
 */
export interface AccessTokenClaims {
  sub: string; // user id
  oid: string; // organisation id
  mid: string; // membership id
  kind: OrganisationKind;
  role: MembershipRole;
}

export interface IssuedRefreshToken {
  /** Sent to the client. Never stored. */
  token: string;
  /** Stored. Never sent. */
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return this.jwt.signAsync(claims);
  }

  verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return this.jwt.verifyAsync<AccessTokenClaims>(token);
  }

  /**
   * 32 bytes of CSPRNG output. `familyId` is carried across rotations so a
   * replayed token can be traced to every descendant and revoked with it.
   */
  issueRefreshToken(familyId: string = randomUUID()): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });

    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      familyId,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    };
  }

  /**
   * SHA-256, not argon2. Argon2 is slow on purpose to defend LOW-entropy
   * secrets that humans choose. This token is 32 random bytes — there is no
   * dictionary to attack, so slowness buys nothing and costs ~80ms per refresh.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshTokenTtlMs(): number {
    return this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
  }

  /** Same value the JWT is signed with, so `expiresIn` cannot drift from reality. */
  accessTokenTtlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
  }
}
