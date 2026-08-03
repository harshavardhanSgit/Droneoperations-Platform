import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally registered JwtAuthGuard.
 *
 * Deliberately verbose to write. Making a route public should be a conscious,
 * visible act — the default is protected.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
