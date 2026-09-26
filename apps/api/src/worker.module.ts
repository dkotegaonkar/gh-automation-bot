import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActionRunnerService } from './actions/action-runner.service';
import { AiModule } from './ai/groq.service';
import { SecretBoxModule } from './common/secret-box';
import { AppConfigModule } from './config/config.module';
import { GithubModule } from './github/github.module';
import { AppLoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.service';
import { QueueModule } from './queue/sqs.service';
import { ReconcilerService } from './reconciler/reconciler.service';
import { DeliveryProcessorService } from './worker/delivery-processor.service';
import { OutboxSweeperService } from './worker/outbox-sweeper.service';
import { SqsConsumerService } from './worker/sqs-consumer.service';

/** Worker process: consumes SQS, runs rules, performs actions. No HTTP server. */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    QueueModule,
    SecretBoxModule,
    GithubModule,
    AiModule,
    ScheduleModule.forRoot(),
  ],
  providers: [DeliveryProcessorService, ActionRunnerService, SqsConsumerService, OutboxSweeperService, ReconcilerService],
})
export class WorkerModule {}
