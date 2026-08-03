import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../../config/env.validation';
import type { ActorContext } from '../actor-context';
import type { AccessTokenClaims } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /**
   * Runs only after the signature and expiry have already been verified.
   *
   * Deliberately does NOT query the database. The token carries everything the
   * actor context needs, so an authenticated request costs zero queries. The
   * price is staleness: a revoked membership stays usable until the token
   * expires. That window is exactly JWT_ACCESS_TTL_SECONDS — which is why it
   * is 15 minutes and not 24 hours.
   */
  validate(claims: AccessTokenClaims): ActorContext {
    return {
      userId: claims.sub,
      membershipId: claims.mid,
      organisationId: claims.oid,
      organisationKind: claims.kind,
      role: claims.role,
      principalOrganisationId: claims.oid,
    };
  }
}
