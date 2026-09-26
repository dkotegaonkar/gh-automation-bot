import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { AppLoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.service';

/** HTTP process: auth, webhook intake, dashboard API. */
@Module({
  imports: [AppConfigModule, AppLoggerModule, PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
