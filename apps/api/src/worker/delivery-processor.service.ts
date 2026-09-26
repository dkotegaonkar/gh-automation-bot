import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus } from '../generated/prisma/client';
import { InstallationSyncService } from '../github/installation-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_RECEIVES } from './backoff';

/** Processes one stored delivery. Safe to call more than once for the same delivery. */
@Injectable()
export class DeliveryProcessorService {
  private readonly logger = new Logger(DeliveryProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly installations: InstallationSyncService,
  ) {}

  async process(deliveryId: string, receiveCount: number): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) {
      this.logger.warn({ deliveryId }, 'message for unknown delivery; dropping');
      return;
    }
    if (delivery.status === DeliveryStatus.PROCESSED || delivery.status === DeliveryStatus.IGNORED) {
      this.logger.log({ deliveryId }, 'already processed; skipping duplicate message');
      return;
    }

    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: DeliveryStatus.PROCESSING, attempts: { increment: 1 } },
    });

    try {
      const payload = delivery.payload as Record<string, any>;
      let status: DeliveryStatus = DeliveryStatus.PROCESSED;

      switch (delivery.event) {
        case 'installation':
        case 'installation_repositories':
          await this.installations.applyWebhook(delivery.event, payload);
          break;
        case 'issues':
        case 'pull_request':
        case 'push':
          if (!delivery.repositoryId) status = DeliveryStatus.IGNORED; // repo not connected
          // Rules engine + actions arrive in the next phase.
          break;
        default:
          status = DeliveryStatus.IGNORED;
      }

      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { status, processedAt: new Date(), lastError: null },
      });
    } catch (err) {
      const lastAttempt = receiveCount >= MAX_RECEIVES;
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: lastAttempt ? DeliveryStatus.FAILED : DeliveryStatus.PROCESSING,
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      throw err; // let the consumer schedule the retry (or SQS move it to the DLQ)
    }
  }
}
