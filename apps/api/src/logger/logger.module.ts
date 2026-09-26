import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config';
import { redactQuery } from './redact';

/** Paths scrubbed from every log line. Anything token/secret-shaped must be listed here. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-hub-signature-256"]',
  'res.headers["set-cookie"]',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.privateKey',
  '*.clientSecret',
  '*.webhookUrl',
];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          redact: { paths: REDACT_PATHS, censor: '[redacted]' },
          // Correlate logs with GitHub's delivery id when there is one.
          genReqId: (req) => (req.headers['x-github-delivery'] as string | undefined) ?? randomUUID(),
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          serializers: {
            // OAuth callback URLs carry a one-time ?code= and ?state= — keep them out of logs.
            req: (req: { url?: string }) => ({ ...req, url: redactQuery(req.url) }),
          },
          transport:
            config.get('NODE_ENV') === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class AppLoggerModule {}
