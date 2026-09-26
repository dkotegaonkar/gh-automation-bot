import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env, validateEnv } from './env';

/** Typed accessor: `config.get('SQS_QUEUE_URL')` returns the validated value. */
export class AppConfig extends ConfigService<Env, true> {}

@Global()
@Module({
  imports: [ConfigModule.forRoot({ validate: validateEnv, cache: true })],
  providers: [{ provide: AppConfig, useExisting: ConfigService }],
  exports: [AppConfig],
})
export class AppConfigModule {}
