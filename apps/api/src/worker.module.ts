import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { AppLoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.service';

/** Worker process: consumes SQS, runs rules, performs actions. No HTTP server. */
@Module({
  imports: [AppConfigModule, AppLoggerModule, PrismaModule],
})
export class WorkerModule {}
