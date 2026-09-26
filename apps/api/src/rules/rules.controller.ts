import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import type { Session } from '../auth/session.service';
import { parseBody } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { RuleInput, ruleInputSchema } from './rule.schema';

@Controller('rules')
@UseGuards(SessionGuard)
export class RulesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentSession() s: Session) {
    return this.prisma.rule.findMany({
      where: { userId: s.userId },
      orderBy: { createdAt: 'asc' },
      include: { repository: { select: { fullName: true } } },
    });
  }

  @Post()
  async create(@CurrentSession() s: Session, @Body() body: unknown) {
    const input = parseBody(ruleInputSchema, body);
    await this.assertReferencesOwned(s.userId, input);
    return this.prisma.rule.create({ data: { ...input, userId: s.userId } });
  }

  @Put(':id')
  async update(@CurrentSession() s: Session, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(ruleInputSchema, body);
    await this.findOwned(s.userId, id);
    await this.assertReferencesOwned(s.userId, input);
    return this.prisma.rule.update({ where: { id }, data: input });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentSession() s: Session, @Param('id') id: string) {
    await this.findOwned(s.userId, id);
    await this.prisma.rule.delete({ where: { id } });
  }

  private async findOwned(userId: string, id: string) {
    const rule = await this.prisma.rule.findFirst({ where: { id, userId } });
    if (!rule) throw new NotFoundException();
    return rule;
  }

  /** A rule may only point at the user's own repositories and Slack destinations. */
  private async assertReferencesOwned(userId: string, input: RuleInput) {
    if (input.repositoryId) {
      const repo = await this.prisma.repository.findFirst({
        where: { id: input.repositoryId, installation: { userId } },
      });
      if (!repo) throw new BadRequestException('unknown repository');
    }
    const targetIds = input.actions.flatMap((a) => (a.type === 'slack' && a.targetId ? [a.targetId] : []));
    if (targetIds.length) {
      const owned = await this.prisma.slackTarget.count({ where: { id: { in: targetIds }, userId } });
      if (owned !== new Set(targetIds).size) throw new BadRequestException('unknown Slack destination');
    }
  }
}
