import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GithubAppService } from './github-app.service';

interface RepoRef {
  id: number;
  full_name: string;
  private: boolean;
}

interface InstallationRef {
  id: number;
  account: { login: string; type?: string } | null;
  suspended_at?: string | null;
}

/** Keeps Installation/Repository rows in step with GitHub. Every write is an idempotent upsert. */
@Injectable()
export class InstallationSyncService {
  private readonly logger = new Logger(InstallationSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubAppService,
  ) {}

  /**
   * Called at sign-in with the user's token. GET /user/installations only returns installations
   * the user can actually access, so this is the trusted way to link installations to a user.
   */
  async syncForUser(userId: string, userToken: string): Promise<void> {
    const installations = (await this.github
      .forUser(userToken)
      .paginate('GET /user/installations')) as unknown as InstallationRef[];

    for (const inst of installations) {
      await this.upsertInstallation(inst, userId);
      await this.syncRepositories(inst.id);
    }
  }

  /** Full repository refresh for one installation, using the installation token. */
  async syncRepositories(githubInstallationId: number): Promise<void> {
    const repos = (await this.github
      .forInstallation(githubInstallationId)
      .paginate('GET /installation/repositories')) as unknown as RepoRef[];

    const installation = await this.prisma.installation.findUniqueOrThrow({
      where: { githubInstallationId: BigInt(githubInstallationId) },
    });
    await this.upsertRepositories(installation.id, repos);
    // Anything we had that GitHub no longer lists has been removed from the installation.
    await this.prisma.repository.updateMany({
      where: {
        installationId: installation.id,
        removedAt: null,
        githubRepoId: { notIn: repos.map((r) => BigInt(r.id)) },
      },
      data: { removedAt: new Date() },
    });
  }

  /** Handles `installation` and `installation_repositories` webhook events. */
  async applyWebhook(event: string, payload: Record<string, any>): Promise<void> {
    const inst = payload.installation as InstallationRef;
    const action = payload.action as string;

    if (event === 'installation') {
      if (action === 'deleted') {
        await this.markInstallationDeleted(inst.id);
        return;
      }
      // Link to the installing user if they have signed in before (sender is verified by the signature).
      const user = await this.prisma.user.findUnique({ where: { githubId: BigInt(payload.sender.id) } });
      const row = await this.upsertInstallation(inst, user?.id);
      if (action === 'suspend' || action === 'unsuspend') return;
      await this.upsertRepositories(row.id, (payload.repositories ?? []) as RepoRef[]);
      return;
    }

    if (event === 'installation_repositories') {
      const row = await this.upsertInstallation(inst);
      await this.upsertRepositories(row.id, (payload.repositories_added ?? []) as RepoRef[]);
      const removed = ((payload.repositories_removed ?? []) as RepoRef[]).map((r) => BigInt(r.id));
      if (removed.length) {
        await this.prisma.repository.updateMany({
          where: { githubRepoId: { in: removed } },
          data: { removedAt: new Date() },
        });
      }
    }
  }

  private upsertInstallation(inst: InstallationRef, userId?: string) {
    const data = {
      accountLogin: inst.account?.login ?? 'unknown',
      accountType: inst.account?.type ?? 'User',
      suspendedAt: inst.suspended_at ? new Date(inst.suspended_at) : null,
      deletedAt: null,
    };
    return this.prisma.installation.upsert({
      where: { githubInstallationId: BigInt(inst.id) },
      create: { githubInstallationId: BigInt(inst.id), ...data, userId },
      // Never unlink an existing owner here; only fill it in.
      update: { ...data, ...(userId ? { userId } : {}) },
    });
  }

  private async upsertRepositories(installationId: string, repos: RepoRef[]) {
    for (const r of repos) {
      await this.prisma.repository.upsert({
        where: { githubRepoId: BigInt(r.id) },
        create: { githubRepoId: BigInt(r.id), fullName: r.full_name, private: r.private, installationId },
        update: { fullName: r.full_name, private: r.private, installationId, removedAt: null },
      });
    }
  }

  private async markInstallationDeleted(githubInstallationId: number) {
    const now = new Date();
    const row = await this.prisma.installation.updateMany({
      where: { githubInstallationId: BigInt(githubInstallationId) },
      data: { deletedAt: now },
    });
    if (row.count) {
      await this.prisma.repository.updateMany({
        where: { installation: { githubInstallationId: BigInt(githubInstallationId) } },
        data: { removedAt: now },
      });
    }
    this.logger.log({ githubInstallationId }, 'installation deleted');
  }
}
