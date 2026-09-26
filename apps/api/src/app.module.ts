import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SecretBoxModule } from './common/secret-box';
import { AppConfigModule } from './config/config.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { GithubModule } from './github/github.module';
import { HealthController } from './health/health.controller';
import { AppLoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.service';
import { QueueModule } from './queue/sqs.service';
import { RulesController } from './rules/rules.controller';
import { SlackTargetsController } from './slack/slack-targets.controller';
import { WebhooksModule } from './webhooks/webhooks.module';

/** HTTP process: auth, webhook intake, dashboard API. */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    QueueModule,
    SecretBoxModule,
    GithubModule,
    AuthModule,
    WebhooksModule,
  ],
  controllers: [HealthController, DashboardController, RulesController, SlackTargetsController],
})
export class AppModule {}
