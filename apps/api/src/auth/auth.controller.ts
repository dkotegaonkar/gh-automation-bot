import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Controller, Get, HttpCode, Logger, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/config.module';
import { GithubAppService, GithubUser } from '../github/github-app.service';
import { InstallationSyncService } from '../github/installation-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, SessionService } from './session.service';

const STATE_TTL_SECONDS = 10 * 60;

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly config: AppConfig,
    private readonly github: GithubAppService,
    private readonly sync: InstallationSyncService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  /** Sign in. The callback goes through the web origin so the cookie is first-party there. */
  @Get('github/login')
  login(@Res() res: Response) {
    res.redirect(this.github.authorizeUrl(this.callbackUrl(), this.newState(res)));
  }

  /** Install the app on more accounts/repos. GitHub then does OAuth and returns to the same callback. */
  @Get('github/install')
  install(@Res() res: Response) {
    res.redirect(this.github.installUrl(this.newState(res)));
  }

  @Get('github/callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });

    // CSRF protection. If state is missing/mismatched (e.g. install started from github.com),
    // restart a normal sign-in instead of trusting the code.
    if (!code || !state || !expected || !safeEqual(state, expected)) {
      this.logger.warn('oauth callback without valid state; restarting sign-in');
      return res.redirect(`${this.config.get('WEB_URL')}/api/auth/github/login`);
    }

    try {
      const token = await this.github.exchangeCode(code, this.callbackUrl());
      const { data: ghUser } = (await this.github.forUser(token).request('GET /user')) as { data: GithubUser };

      const user = await this.prisma.user.upsert({
        where: { githubId: BigInt(ghUser.id) },
        create: { githubId: BigInt(ghUser.id), login: ghUser.login, avatarUrl: ghUser.avatar_url },
        update: { login: ghUser.login, avatarUrl: ghUser.avatar_url },
      });
      await this.sync.syncForUser(user.id, token);
      // The user token goes out of scope here; it is never persisted.

      const jwt = await this.sessions.issue({ userId: user.id, login: user.login });
      res.cookie(SESSION_COOKIE, jwt, this.sessions.cookieOptions());
      this.logger.log({ userId: user.id, login: user.login }, 'user signed in');
      return res.redirect(`${this.config.get('WEB_URL')}/dashboard`);
    } catch (err) {
      this.logger.error({ err }, 'sign-in failed');
      return res.redirect(`${this.config.get('WEB_URL')}/?error=signin_failed`);
    }
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  private callbackUrl() {
    return `${this.config.get('WEB_URL')}/api/auth/github/callback`;
  }

  private newState(res: Response): string {
    const state = randomBytes(24).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, this.sessions.cookieOptions(STATE_TTL_SECONDS));
    return state;
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
