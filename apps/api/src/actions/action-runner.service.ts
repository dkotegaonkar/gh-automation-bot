import { Injectable, Logger } from '@nestjs/common';
import { SecretBox } from '../common/secret-box';
import { ActionStatus, ActionType, Prisma } from '../generated/prisma/client';
import { GithubAppService } from '../github/github-app.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EventContext } from '../rules/event-context';
import type { RuleAction } from '../rules/rule.schema';
import { buildSlackMessage } from './slack-message';

export interface MatchedRule {
  id: string;
  name: string;
  userId: string;
  actions: RuleAction[];
}

export interface RepoRef {
  id: string;
  fullName: string;
  githubInstallationId: number;
}

type Outcome = { status: 'SUCCEEDED' | 'SKIPPED'; result: Prisma.InputJsonValue };

const TYPE: Record<RuleAction['type'], ActionType> = {
  add_label: ActionType.ADD_LABEL,
  comment: ActionType.COMMENT,
  slack: ActionType.SLACK,
};

export const commentMarker = (idempotencyKey: string) => `<!-- ghbot:${idempotencyKey} -->`;

/**
 * Runs every action of every matched rule exactly once per delivery.
 * Each action has an ActionRun keyed by `deliveryId:ruleId:index`; succeeded runs are never repeated,
 * so a redelivered event or a retried SQS message only redoes what actually failed.
 */
@Injectable()
export class ActionRunnerService {
  private readonly logger = new Logger(ActionRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubAppService,
    private readonly secrets: SecretBox,
  ) {}

  async runAll(deliveryId: string, repo: RepoRef, ctx: EventContext, rules: MatchedRule[], lastAttempt: boolean) {
    const failures: string[] = [];

    for (const rule of rules) {
      for (const [index, action] of rule.actions.entries()) {
        const idempotencyKey = `${deliveryId}:${rule.id}:${index}`;
        const run = await this.prisma.actionRun.upsert({
          where: { idempotencyKey },
          create: { deliveryId, ruleId: rule.id, type: TYPE[action.type], idempotencyKey, params: action },
          update: {},
        });
        if (run.status === ActionStatus.SUCCEEDED || run.status === ActionStatus.SKIPPED) continue;

        try {
          const outcome = await this.execute(action, { repo, ctx, rule, idempotencyKey, isRetry: run.attempts > 0 });
          await this.prisma.actionRun.update({
            where: { id: run.id },
            data: {
              status: outcome.status,
              result: outcome.result,
              attempts: { increment: 1 },
              lastError: null,
              completedAt: new Date(),
            },
          });
        } catch (err) {
          const message = describeError(err);
          failures.push(`${action.type}: ${message}`);
          await this.prisma.actionRun.update({
            where: { id: run.id },
            // PENDING + lastError = "will retry"; FAILED only once retries are exhausted.
            data: { status: lastAttempt ? ActionStatus.FAILED : ActionStatus.PENDING, attempts: { increment: 1 }, lastError: message },
          });
          this.logger.warn({ deliveryId, ruleId: rule.id, action: action.type, err: message }, 'action failed');
        }
      }
    }

    if (failures.length) throw new Error(`${failures.length} action(s) failed: ${failures.join('; ')}`);
  }

  private async execute(
    action: RuleAction,
    job: { repo: RepoRef; ctx: EventContext; rule: MatchedRule; idempotencyKey: string; isRetry: boolean },
  ): Promise<Outcome> {
    const { repo, ctx } = job;
    const [owner, name] = repo.fullName.split('/') as [string, string];
    const octokit = () => this.github.forInstallation(repo.githubInstallationId);

    switch (action.type) {
      case 'add_label': {
        if (!ctx.number) return { status: 'SKIPPED', result: { reason: 'event has no issue or pull request' } };
        // Idempotent on GitHub's side: adding a label that is already present is a no-op.
        await octokit().rest.issues.addLabels({ owner, repo: name, issue_number: ctx.number, labels: [action.label] });
        return { status: 'SUCCEEDED', result: { label: action.label } };
      }

      case 'comment': {
        if (!ctx.number) return { status: 'SKIPPED', result: { reason: 'event has no issue or pull request' } };
        const marker = commentMarker(job.idempotencyKey);
        if (job.isRetry) {
          // A previous attempt may have posted before crashing; look for our marker first.
          const existing = await octokit().paginate(octokit().rest.issues.listComments, {
            owner,
            repo: name,
            issue_number: ctx.number,
            per_page: 100,
          });
          const found = existing.find((c) => c.body?.includes(marker));
          if (found) return { status: 'SUCCEEDED', result: { commentId: found.id, url: found.html_url, deduplicated: true } };
        }
        const body = action.body.replaceAll('{{author}}', `@${ctx.author}`) + `\n\n${marker}`;
        const { data } = await octokit().rest.issues.createComment({ owner, repo: name, issue_number: ctx.number, body });
        return { status: 'SUCCEEDED', result: { commentId: data.id, url: data.html_url } };
      }

      case 'slack': {
        const target = await this.prisma.slackTarget.findFirst({
          where: { userId: job.rule.userId, ...(action.targetId ? { id: action.targetId } : {}) },
          orderBy: { createdAt: 'asc' },
        });
        if (!target) return { status: 'SKIPPED', result: { reason: 'no Slack destination configured' } };
        const res = await fetch(this.secrets.open(target.webhookUrlEnc), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildSlackMessage(repo.fullName, ctx, job.rule.name)),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Slack responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return { status: 'SUCCEEDED', result: { target: target.name } };
      }
    }
  }
}

/** Short, secret-free error text for the dashboard (never includes URLs or tokens). */
function describeError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  const msg = (e?.message ?? String(err)).replace(/https?:\/\/\S+/g, '[url]');
  return (e?.status ? `HTTP ${e.status}: ${msg}` : msg).slice(0, 500);
}
