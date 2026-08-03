import { HttpException, HttpStatus } from '@nestjs/common';

export abstract class AppException extends HttpException {
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  protected constructor(
    code: string,
    message: string,
    status: HttpStatus,
    details?: Record<string, unknown>,
  ) {
    super(message, status);
    this.code = code;
    this.details = details;
  }
}

export class InvalidInputException extends AppException {
  constructor(message = 'Invalid input', details?: Record<string, unknown>) {
    super('INVALID_INPUT', message, HttpStatus.BAD_REQUEST, details);
  }
}

export class UnauthenticatedException extends AppException {
  /** `code` is overridable so a client can distinguish TOKEN_EXPIRED (retry
   *  after refresh) from an invalid token (send the user to log in). */
  constructor(message = 'Authentication required', code = 'UNAUTHENTICATED') {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class AccessDeniedException extends AppException {
  constructor(message = 'You do not have permission to perform this action') {
    super('ACCESS_DENIED', message, HttpStatus.FORBIDDEN);
  }
}

export class ResourceNotFoundException extends AppException {
  constructor(resource: string, id?: string) {
    super(
      'RESOURCE_NOT_FOUND',
      id ? `${resource} '${id}' was not found` : `${resource} was not found`,
      HttpStatus.NOT_FOUND,
      id ? { resource, id } : { resource },
    );
  }
}

/**
 * Two states cannot coexist — e.g. a second active assignment on a booking.
 * Carries its own code because there are many distinct conflicts.
 */
export class ResourceConflictException extends AppException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * The request was well-formed and permitted, but a domain rule rejected it —
 * BR1 provider-not-approved, BR7 already-reviewed, and so on.
 */
export class BusinessRuleException extends AppException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

export class DependencyUnavailableException extends AppException {
  constructor(dependency: string) {
    super(
      'DEPENDENCY_UNAVAILABLE',
      `${dependency} is unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE,
      { dependency },
    );
  }
}
