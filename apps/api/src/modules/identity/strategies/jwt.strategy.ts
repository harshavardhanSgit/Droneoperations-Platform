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

  /** Runs only after the signature and expiry have already been verified. */
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
