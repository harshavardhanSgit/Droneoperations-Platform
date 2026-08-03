import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { ActorContext } from '../actor-context';

/**
 * Injects the ActorContext built by JwtStrategy.
 *
 * Exists so no controller ever touches `req.user` directly — that property is
 * typed `any` by Express, and reading it by hand means every controller
 * re-asserts a shape nobody validates.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof ActorContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: ActorContext }>();
    const actor = request.user;

    return field ? actor?.[field] : actor;
  },
);
