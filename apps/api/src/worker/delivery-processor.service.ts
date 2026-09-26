import { Injectable, Logger } from '@nestjs/common';
import { ActionRunnerService, MatchedRule } from '../actions/action-runner.service';
import { AppConfig } from '../config/config.module';
import { Delivery, DeliveryStatus } from '../generated/prisma/client';
import { InstallationSyncService } from '../github/installation-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { toEventContext } from '../rules/event-context';
import { matchesRule } from '../rules/matcher';
import { ruleInputSchema } from '../rules/rule.schema';
import { MAX_RECEIVES } from './backoff';

/** Processes one stored delivery. Safe to call more than once for the same delivery. */
@Injectable()
export class DeliveryProcessorService {
  private readonly logger = new Logger(DeliveryProcessorService.name);
  private readonly botLogin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly installations: InstallationSyncService,
    private readonly actions: ActionRunnerService,
    config: AppConfig,
  ) {
    this.botLogin = `${config.get('GITHUB_APP_SLUG')}[bot]`;
  }

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

    const lastAttempt = receiveCount >= MAX_RECEIVES;
    try {
      const status = await this.route(delivery, lastAttempt);
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: { status, processedAt: new Date(), lastError: null },
      });
    } catch (err) {
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

  private async route(delivery: Delivery, lastAttempt: boolean): Promise<DeliveryStatus> {
    const payload = delivery.payload as Record<string, any>;

    if (delivery.event === 'installation' || delivery.event === 'installation_repositories') {
      await this.installations.applyWebhook(delivery.event, payload);
      return DeliveryStatus.PROCESSED;
    }

    const ctx = toEventContext(delivery.event, payload);
    if (!ctx || !delivery.repositoryId) return DeliveryStatus.IGNORED;
    // Our own labels/comments trigger new events; never react to ourselves.
    if (ctx.senderIsBot && ctx.senderLogin === this.botLogin) return DeliveryStatus.IGNORED;

    const repo = await this.prisma.repository.findUnique({
      where: { id: delivery.repositoryId },
      include: { installation: true },
    });
    if (!repo || !repo.enabled || repo.removedAt || !repo.installation.userId) return DeliveryStatus.IGNORED;

    const rules = await this.prisma.rule.findMany({
      where: { enabled: true, userId: repo.installation.userId, OR: [{ repositoryId: null }, { repositoryId: repo.id }] },
      orderBy: { createdAt: 'asc' },
    });

    const matched: MatchedRule[] = [];
    for (const r of rules) {
      const parsed = ruleInputSchema.safeParse({
        name: r.name,
        repositoryId: r.repositoryId,
        enabled: r.enabled,
        events: r.events,
        conditions: r.conditions,
        actions: r.actions,
      });
      if (!parsed.success) {
        this.logger.warn({ ruleId: r.id }, 'stored rule failed validation; skipping');
        continue;
      }
      if (matchesRule(parsed.data, ctx)) {
        matched.push({ id: r.id, name: r.name, userId: r.userId, actions: parsed.data.actions });
      }
    }

    if (matched.length) {
      await this.actions.runAll(
        delivery.id,
        { id: repo.id, fullName: repo.fullName, githubInstallationId: Number(repo.installation.githubInstallationId) },
        ctx,
        matched,
        lastAttempt,
      );
    }
    this.logger.log({ deliveryId: delivery.id, key: ctx.key, matchedRules: matched.map((m) => m.id) }, 'delivery processed');
    return DeliveryStatus.PROCESSED;
  }
}
