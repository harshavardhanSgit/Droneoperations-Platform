import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../permissions';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/** Level-1 authorisation. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
