import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../permissions';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Level-1 authorisation. All listed permissions must be held (AND, not OR) —
 * an endpoint that needs two capabilities needs both, and OR is almost always
 * a sign the endpoint is doing two jobs.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
