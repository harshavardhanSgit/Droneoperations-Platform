import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AccessDeniedException, UnauthenticatedException } from '../../../common/errors/app.exception';
import type { ActorContext } from '../actor-context';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { actorHasPermission, type Permission } from '../permissions';

/**
 * Runs after JwtAuthGuard, so request.user is already populated.
 *
 * Stateless by design: it decides from the token's claims and the static
 * permission map, with no database access. Anything that needs to load a record
 * to decide is a level-2 (ownership) check and belongs in the service.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) {
      return true;
    }

    const actor = context.switchToHttp().getRequest<{ user?: ActorContext }>().user;

    if (!actor) {
      throw new UnauthenticatedException();
    }

    const missing = required.filter((permission) => !actorHasPermission(actor, permission));

    if (missing.length) {
      // The message names what was needed. This is not a leak: the caller is
      // authenticated, and a vague 403 just generates support tickets.
      throw new AccessDeniedException(
        `Your role does not permit this action (requires: ${missing.join(', ')})`,
      );
    }

    return true;
  }
}
