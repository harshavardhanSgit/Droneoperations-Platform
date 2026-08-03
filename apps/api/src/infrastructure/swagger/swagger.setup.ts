import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Drone Operations Platform API')
    .setDescription(
      'Enterprise platform for commercial drone service operations.\n\n' +
        'All successful responses are wrapped in `{ data }`. All errors are ' +
        'wrapped in `{ error }` and carry a stable `code` plus a `requestId` ' +
        'matching the `x-request-id` response header.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('Health', 'Liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });

  Logger.log(`Swagger UI available at /${SWAGGER_PATH}`, 'Swagger');
}
