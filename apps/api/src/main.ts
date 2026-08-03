import { Logger as NestLogger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { validationExceptionFactory } from './common/validation/validation-exception.factory';
import type { Env } from './config/env.validation';
import { setupSwagger } from './infrastructure/swagger/swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // Express can SET cookies natively but not READ them; this populates req.cookies.
  app.use(cookieParser());

  // The local storage adapter receives raw bytes, not JSON. Registered only
  // for that path so every other route keeps normal body parsing.
  app.use(
    '/api/v1/storage/upload',
    express.raw({ type: () => true, limit: '16mb' }),
  );

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties not declared on the DTO. Without this, a client could
      // POST { role: "ADMIN" } and a careless spread would persist it.
      whitelist: true,
      // Reject rather than silently strip, so typos surface instead of being ignored.
      forbidNonWhitelisted: true,
      // Turn the plain JSON body into an instance of the DTO class.
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // credentials:true is what allows the browser to send the refresh cookie.
  // It requires an explicit origin — the spec forbids pairing it with "*".
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  // Not exposed in production: this API is internal, and publishing a complete
  // map of every endpoint and payload shape is an unnecessary gift to anyone
  // probing it. Public-API companies make the opposite call deliberately.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });

  await app.listen(port);

  NestLogger.log(`API listening on http://localhost:${port}/api/v1`, 'Bootstrap');
}

// Deliberately console.error, not the Nest logger: bootstrap can fail before
// the logger exists, and a fatal handler must not depend on what it reports on.
bootstrap().catch((error: unknown) => {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
});
