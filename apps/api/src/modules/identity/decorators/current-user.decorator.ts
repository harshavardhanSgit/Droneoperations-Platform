import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { ActorContext } from '../actor-context';

/** Injects the ActorContext built by JwtStrategy. */
export const CurrentUser = createParamDecorator(
  (field: keyof ActorContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: ActorContext }>();
    const actor = request.user;

    return field ? actor?.[field] : actor;
  },
);
