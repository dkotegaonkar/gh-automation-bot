import { Injectable, Logger } from '@nestjs/common';
import { DeliveryStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SqsService } from '../queue/sqs.service';

/** Events we store and process. Everything else is acknowledged and dropped. */
export const HANDLED_EVENTS = new Set([
  'issues',
  'pull_request',
  'push',
  'installation',
  'installation_repositories',
]);

export type IntakeResult =
  | { outcome: 'queued' | 'stored'; deliveryId: string }
  | { outcome: 'duplicate'; deliveryId: string }
  | { outcome: 'ignored' };

@Injectable()
export class WebhookIntakeService {
  private readonly logger = new Logger(WebhookIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sqs: SqsService,
  ) {}

  /**
   * Persist first, then enqueue (outbox pattern). Must stay fast: GitHub times out after 10s.
   * Caller has already verified the signature.
   */
  async intake(githubDeliveryId: string, event: string, payload: Record<string, any>): Promise<IntakeResult> {
    if (!HANDLED_EVENTS.has(event)) return { outcome: 'ignored' };

    const repo = payload.repository?.id
      ? await this.prisma.repository.findUnique({ where: { githubRepoId: BigInt(payload.repository.id) } })
      : null;

    let deliveryId: string;
    try {
      const row = await this.prisma.delivery.create({
        data: {
          githubDeliveryId,
          event,
          action: typeof payload.action === 'string' ? payload.action : null,
          githubInstallationId: payload.installation?.id ? BigInt(payload.installation.id) : null,
          repositoryId: repo?.id ?? null,
          senderLogin: payload.sender?.login ?? null,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      deliveryId = row.id;
    } catch (err) {
      // Unique violation on githubDeliveryId: GitHub redelivered (or someone replayed) this delivery.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.delivery.findUniqueOrThrow({ where: { githubDeliveryId } });
        this.logger.log({ githubDeliveryId }, 'duplicate delivery ignored');
        return { outcome: 'duplicate', deliveryId: existing.id };
      }
      throw err;
    }

    try {
      await this.sqs.enqueueDelivery(deliveryId);
      await this.prisma.delivery.update({ where: { id: deliveryId }, data: { status: DeliveryStatus.QUEUED } });
      return { outcome: 'queued', deliveryId };
    } catch (err) {
      // Stored but not queued: the outbox sweeper will pick it up. Still a success for GitHub.
      this.logger.error({ err, deliveryId }, 'enqueue failed; left for outbox sweeper');
      return { outcome: 'stored', deliveryId };
    }
  }
}
