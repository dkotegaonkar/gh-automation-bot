import { BadGatewayException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import type { Session } from '../auth/session.service';
import { SecretBox } from '../common/secret-box';
import { parseBody } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    webhookUrl: z
      .string()
      .trim()
      .regex(/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/, 'must be a Slack incoming webhook URL'),
  })
  .strict();

/** Slack incoming-webhook URLs are secrets: stored encrypted, never returned to the browser. */
@Controller('slack-targets')
@UseGuards(SessionGuard)
export class SlackTargetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
  ) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    const rows = await this.prisma.slackTarget.findMany({ where: { userId: s.userId }, orderBy: { createdAt: 'asc' } });
    return rows.map((t) => ({ id: t.id, name: t.name, hint: mask(this.secrets.open(t.webhookUrlEnc)), createdAt: t.createdAt }));
  }

  @Post()
  async create(@CurrentSession() s: Session, @Body() body: unknown) {
    const input = parseBody(createSchema, body);
    const t = await this.prisma.slackTarget.create({
      data: { userId: s.userId, name: input.name, webhookUrlEnc: this.secrets.seal(input.webhookUrl) },
    });
    return { id: t.id, name: t.name, hint: mask(input.webhookUrl), createdAt: t.createdAt };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentSession() s: Session, @Param('id') id: string) {
    const { count } = await this.prisma.slackTarget.deleteMany({ where: { id, userId: s.userId } });
    if (!count) throw new NotFoundException();
  }

  @Post(':id/test')
  @HttpCode(204)
  async test(@CurrentSession() s: Session, @Param('id') id: string) {
    const t = await this.prisma.slackTarget.findFirst({ where: { id, userId: s.userId } });
    if (!t) throw new NotFoundException();
    const res = await fetch(this.secrets.open(t.webhookUrlEnc), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `:white_check_mark: Test from GitHub Automation Bot (${t.name})` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new BadGatewayException(`Slack responded ${res.status}`);
  }
}

/** `hooks.slack.com/services/T0123/B0456/…abcd` — enough to recognize, useless to an attacker. */
function mask(url: string): string {
  const [, , , , team, bot, token] = url.split('/');
  return `hooks.slack.com/services/${team}/${bot}/…${(token ?? '').slice(-4)}`;
}
