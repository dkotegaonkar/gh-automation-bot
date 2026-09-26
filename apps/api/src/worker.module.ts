import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { GithubModule } from './github/github.module';
import { AppLoggerModule } from './logger/logger.module';
import { PrismaModule } from './prisma/prisma.service';
import { QueueModule } from './queue/sqs.service';
import { DeliveryProcessorService } from './worker/delivery-processor.service';
import { OutboxSweeperService } from './worker/outbox-sweeper.service';
import { SqsConsumerService } from './worker/sqs-consumer.service';

/** Worker process: consumes SQS, runs rules, performs actions. No HTTP server. */
@Module({
  imports: [AppConfigModule, AppLoggerModule, PrismaModule, QueueModule, GithubModule, ScheduleModule.forRoot()],
  providers: [DeliveryProcessorService, SqsConsumerService, OutboxSweeperService],
})
export class WorkerModule {}
