import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

import { AppException } from '../errors/app.exception';
import type { ErrorEnvelope } from '../http/envelope.types';

interface NormalisedError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'ACCESS_DENIED',
  404: 'ROUTE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const normalised = this.normalise(exception);

    if (normalised.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception }, 'Unhandled exception');
    }

    const body: ErrorEnvelope = {
      error: {
        code: normalised.code,
        message: normalised.message,
        ...(normalised.details ? { details: normalised.details } : {}),
        ...(request.id ? { requestId: request.id } : {}),
      },
    };

    response.status(normalised.status).json(body);
  }

  private normalise(exception: unknown): NormalisedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: unknown }).message ?? exception.message);

      return {
        status,
        code: STATUS_CODES[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : String(message),
      };
    }

    // Anything unrecognised is a bug. Report nothing about it — the details are
    // in the log, findable by requestId.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}
