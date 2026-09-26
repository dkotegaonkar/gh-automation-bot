import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';

async function bootstrap() {
  // rawBody: webhook signatures must be verified against the exact bytes GitHub sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1); // behind Caddy
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(app.get(AppConfig).get('PORT'), '0.0.0.0');
}
void bootstrap();
