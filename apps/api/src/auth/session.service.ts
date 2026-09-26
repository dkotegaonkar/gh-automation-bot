import { Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { AppConfig } from '../config/config.module';

export const SESSION_COOKIE = 'ghbot_session';
export const OAUTH_STATE_COOKIE = 'ghbot_oauth_state';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface Session {
  userId: string;
  login: string;
}

/** Stateless session: an HS256 JWT in an httpOnly cookie. The browser never sees a GitHub token. */
@Injectable()
export class SessionService {
  private readonly key: Uint8Array;
  private readonly secure: boolean;

  constructor(config: AppConfig) {
    this.key = new TextEncoder().encode(config.get('SESSION_SECRET'));
    this.secure = config.get('NODE_ENV') === 'production';
  }

  async issue(session: Session): Promise<string> {
    return new SignJWT({ login: session.login })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(session.userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verify(token: string | undefined): Promise<Session | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (!payload.sub || typeof payload.login !== 'string') return null;
      return { userId: payload.sub, login: payload.login };
    } catch {
      return null;
    }
  }

  cookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS): CookieOptions {
    // Lax: sent on the top-level redirect back from GitHub, not on cross-site POSTs.
    return { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/', maxAge: maxAgeSeconds * 1000 };
  }
}
