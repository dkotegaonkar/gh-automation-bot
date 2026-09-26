import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { AppConfig } from '../config/app-config';

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
}

/**
 * All GitHub API access goes through here.
 * - Bot actions use short-lived installation tokens (App JWT → installation token, cached by auth-app).
 * - User tokens are only used during sign-in to identify the user and their installations; never stored.
 */
@Injectable()
export class GithubAppService {
  private readonly installationClients = new Map<number, Octokit>();
  private readonly privateKey: string;

  constructor(private readonly config: AppConfig) {
    this.privateKey = Buffer.from(config.get('GITHUB_APP_PRIVATE_KEY_B64'), 'base64').toString('utf8');
  }

  /** Octokit authenticated as the app installation (acts as `<slug>[bot]`). */
  forInstallation(installationId: number): Octokit {
    let client = this.installationClients.get(installationId);
    if (!client) {
      client = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId: this.config.get('GITHUB_APP_ID'), privateKey: this.privateKey, installationId },
      });
      this.installationClients.set(installationId, client);
    }
    return client;
  }

  forUser(userToken: string): Octokit {
    return new Octokit({ auth: userToken });
  }

  authorizeUrl(redirectUri: string, state: string): string {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.config.get('GITHUB_CLIENT_ID'));
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }

  installUrl(state: string): string {
    return `https://github.com/apps/${this.config.get('GITHUB_APP_SLUG')}/installations/new?state=${encodeURIComponent(state)}`;
  }

  /** Exchanges an OAuth `code` for a user access token. */
  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.get('GITHUB_CLIENT_ID'),
        client_secret: this.config.get('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: redirectUri,
      }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string };
    if (!res.ok || !data.access_token) {
      throw new UnauthorizedException(`GitHub code exchange failed: ${data.error ?? res.status}`);
    }
    return data.access_token;
  }
}
