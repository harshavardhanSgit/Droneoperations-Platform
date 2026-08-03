import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

import { ErrorEnvelopeDto } from '../http/error-envelope.dto';

/**
 * Documents a success response as it is actually sent: wrapped in { data }.
 * Without this the docs would describe the unwrapped shape and be wrong.
 */
export function ApiEnvelope<TModel extends Type<unknown>>(
  model: TModel,
  options: { status?: number; description?: string } = {},
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description ?? '',
      schema: {
        type: 'object',
        required: ['data'],
        properties: { data: { $ref: getSchemaPath(model) } },
      },
    }),
  );
}

export function ApiErrorEnvelope(status: number, description: string) {
  return applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ApiResponse({ status, description, type: ErrorEnvelopeDto }),
  );
}
