import { Global, Injectable, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import type { EventContext } from '../rules/event-context';
import { buildUserPrompt, parseTriage, SYSTEM_PROMPT, Triage } from './triage';

export class AiUnavailableError extends Error {}

/** Groq's OpenAI-compatible chat API (free tier). Called directly with fetch; no SDK needed. */
@Injectable()
export class GroqService {
  private readonly apiKey: string;
  readonly model: string;

  constructor(config: AppConfig) {
    this.apiKey = (config.get('GROQ_API_KEY', { infer: true }) ?? '').trim();
    this.model = config.get('GROQ_MODEL');
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async triage(repo: string, ctx: EventContext): Promise<Triage> {
    if (!this.enabled) throw new AiUnavailableError('GROQ_API_KEY is not configured');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        // gpt-oss models reason before answering; reasoning tokens count against max_tokens.
        max_tokens: 1024,
        ...(this.model.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(repo, ctx) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      // 429 (rate limit) and 5xx are worth retrying; the SQS backoff handles that.
      const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
      throw new Error(`Groq ${res.status}${detail ? `: ${detail.slice(0, 150)}` : ''}`);
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return parseTriage(data.choices?.[0]?.message?.content ?? '');
  }
}

@Global()
@Module({ providers: [GroqService], exports: [GroqService] })
export class AiModule {}
