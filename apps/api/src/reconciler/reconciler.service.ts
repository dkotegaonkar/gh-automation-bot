import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';
import { HANDLED_EVENTS } from '../webhooks/webhook-intake.service';
import { findRedeliveryCandidates, HookDeliveryAttempt, parseDeliveriesPage } from './deliveries-log';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 5;
const MAX_REDELIVERIES_PER_RUN = 20;

/**
 * Recovers events GitHub could not deliver (API down, deploy restart, network blip).
 * GitHub does not retry failed webhooks on its own, so we read the app's delivery log and
 * ask it to redeliver anything that never got a 2xx and that we have not stored.
 */
@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);
  private running = false;

  constructor(
    private readonly github: GithubAppService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(5 * 60_000)
  async reconcile() {
    if (this.running) return;
    this.running = true;
    try {
      const attempts = await this.recentAttempts();
      const candidates = findRedeliveryCandidates(attempts, {
        handledEvents: HANDLED_EVENTS,
        maxAttempts: 3,
        settleMs: 2 * 60_000,
        now: Date.now(),
      });
      if (!candidates.length) return;

      // If we stored it, it reached us (e.g. we 5xx'd after persisting); the outbox sweeper owns it.
      const known = new Set(
        (
          await this.prisma.delivery.findMany({
            where: { githubDeliveryId: { in: candidates.map((c) => c.guid) } },
            select: { githubDeliveryId: true },
          })
        ).map((d) => d.githubDeliveryId),
      );

      let requested = 0;
      for (const c of candidates.filter((c) => !known.has(c.guid)).slice(0, MAX_REDELIVERIES_PER_RUN)) {
        const res = await this.github.appRequest('POST', `/app/hook/deliveries/${c.attemptId}/attempts`);
        if (res.ok) requested++;
        this.logger.log({ guid: c.guid, event: c.event, previousAttempts: c.attempts, status: res.status }, 'requested redelivery');
      }
      this.logger.log({ scanned: attempts.length, candidates: candidates.length, alreadyStored: known.size, requested }, 'reconcile done');
    } catch (err) {
      this.logger.error({ err }, 'reconcile failed');
    } finally {
      this.running = false;
    }
  }

  private async recentAttempts(): Promise<HookDeliveryAttempt[]> {
    const since = Date.now() - LOOKBACK_MS;
    const all: HookDeliveryAttempt[] = [];
    let path: string | null = '/app/hook/deliveries?per_page=100';
    for (let page = 0; path && page < MAX_PAGES; page++) {
      const res = await this.github.appRequest('GET', path);
      if (!res.ok) throw new Error(`GET deliveries failed: ${res.status}`);
      const rows = parseDeliveriesPage(await res.text());
      all.push(...rows);
      if (!rows.length || Date.parse(rows[rows.length - 1]!.delivered_at) < since) break;
      path = nextPath(res.headers.get('link'));
    }
    return all.filter((a) => Date.parse(a.delivered_at) >= since);
  }
}

function nextPath(link: string | null): string | null {
  const m = link?.match(/<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/);
  return m?.[1] ?? null;
}
