import { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/**
 * Typed accessor: `config.get('SQS_QUEUE_URL')` returns the validated value.
 * Kept separate from config.module.ts on purpose: importing that file runs ConfigModule.forRoot(),
 * which validates the environment. Services import this file so unit tests can load them without env.
 */
export class AppConfig extends ConfigService<Env, true> {}
