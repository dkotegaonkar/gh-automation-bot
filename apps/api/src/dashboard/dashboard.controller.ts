import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import type { Session } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import { summarizeDelivery } from './summarize';

const PAGE_SIZE = 50;

@Controller()
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentSession() session: Session) {
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) throw new NotFoundException();
    const repositories = await this.prisma.repository.findMany({
      where: { removedAt: null, installation: { userId: user.id, deletedAt: null } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, private: true, enabled: true },
    });
    return { user: { login: user.login, avatarUrl: user.avatarUrl }, repositories };
  }

  /** Newest first. `before` is a delivery id cursor for pagination. */
  @Get('deliveries')
  async deliveries(@CurrentSession() session: Session, @Query('before') before?: string) {
    const rows = await this.prisma.delivery.findMany({
      where: { repository: { installation: { userId: session.userId } } },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: {
        repository: { select: { fullName: true } },
        actionRuns: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, type: true, status: true, attempts: true, lastError: true, result: true, completedAt: true },
        },
      },
    });

    return rows.map((d) => ({
      id: d.id,
      githubDeliveryId: d.githubDeliveryId,
      event: d.event,
      action: d.action,
      repository: d.repository?.fullName ?? null,
      sender: d.senderLogin,
      status: d.status,
      attempts: d.attempts,
      lastError: d.lastError,
      receivedAt: d.receivedAt,
      processedAt: d.processedAt,
      summary: summarizeDelivery(d.event, d.payload as Record<string, any>),
      actions: d.actionRuns,
    }));
  }
}
