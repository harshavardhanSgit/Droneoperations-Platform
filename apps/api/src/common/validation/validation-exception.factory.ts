import type { ValidationError } from '@nestjs/common';

import { InvalidInputException } from '../errors/app.exception';

function flatten(errors: ValidationError[], parent = ''): Record<string, string[]> {
  return errors.reduce<Record<string, string[]>>((acc, error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;

    if (error.constraints) {
      acc[path] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(acc, flatten(error.children, path));
    }

    return acc;
  }, {});
}

/**
 * Turns class-validator output into our error envelope with per-field detail,
 * so a client can highlight the offending input rather than showing one
 * concatenated string.
 */
export function validationExceptionFactory(errors: ValidationError[]): InvalidInputException {
  return new InvalidInputException('Validation failed', { fields: flatten(errors) });
}
