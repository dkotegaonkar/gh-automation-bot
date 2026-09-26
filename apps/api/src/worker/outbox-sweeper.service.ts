import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DeliveryStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SqsService } from '../queue/sqs.service';

const STUCK_AFTER_MS = 60_000;

/**
 * Deliveries that were stored but never made it onto SQS (SQS error, crash between the two writes)
 * stay RECEIVED. Re-enqueue them. Duplicated messages are harmless: processing is idempotent.
 */
@Injectable()
export class OutboxSweeperService {
  private readonly logger = new Logger(OutboxSweeperService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsService,
  ) {}

  @Interval(60_000)
  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      const stuck = await this.prisma.delivery.findMany({
        where: { status: DeliveryStatus.RECEIVED, receivedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
        select: { id: true },
        take: 100,
      });
      for (const { id } of stuck) {
        await this.sqs.enqueueDelivery(id);
        await this.prisma.delivery.update({ where: { id }, data: { status: DeliveryStatus.QUEUED } });
      }
      if (stuck.length) this.logger.log({ count: stuck.length }, 're-enqueued stuck deliveries');
    } catch (err) {
      this.logger.error({ err }, 'outbox sweep failed');
    } finally {
      this.running = false;
    }
  }
}
