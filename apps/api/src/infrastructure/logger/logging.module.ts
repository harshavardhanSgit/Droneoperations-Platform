import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import type { Env } from '../../config/env.validation';

const HEALTH_PREFIX = '/api/v1/health';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',

            // Reuse an inbound request id if a proxy already assigned one, so a
            // trace survives across services. Echo it back so a client can
            // quote it in a bug report.
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const inbound = req.headers['x-request-id'];
              const id = typeof inbound === 'string' && inbound ? inbound : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },

            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              remove: true,
            },

            // Health probes run every few seconds forever. Logging them buries
            // everything else.
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.startsWith(HEALTH_PREFIX) ?? false,
            },

            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    singleLine: true,
                    translateTime: 'SYS:HH:MM:ss.l',
                    ignore: 'pid,hostname',
                  },
                },
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
