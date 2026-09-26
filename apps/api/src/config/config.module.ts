import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from './app-config';
import { validateEnv } from './env';

export { AppConfig };

@Global()
@Module({
  // ignoreEnvFile: never read ./.env implicitly. Env comes from the process (node --env-file in dev,
  // compose env_file in prod), so tests and local runs see exactly what CI sees.
  imports: [ConfigModule.forRoot({ validate: validateEnv, cache: true, ignoreEnvFile: true })],
  providers: [{ provide: AppConfig, useExisting: ConfigService }],
  exports: [AppConfig],
})
export class AppConfigModule {}
