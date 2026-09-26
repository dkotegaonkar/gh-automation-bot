import { z } from 'zod';

const base64Key = (bytes: number) =>
  z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === bytes, `must be ${bytes} bytes, base64-encoded`);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /** Public URL of the Next.js app (OAuth redirects land back here). */
  WEB_URL: z.url(),
  /** Public URL of this API (used to build the OAuth callback URL). */
  API_URL: z.url(),

  DATABASE_URL: z.string().min(1),

  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_SLUG: z.string().min(1),
  /** PEM private key, base64-encoded so it fits in a single env var line. */
  GITHUB_APP_PRIVATE_KEY_B64: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(16),

  /** Signs session JWTs. */
  SESSION_SECRET: z.string().min(32),
  /** AES-256-GCM key for secrets at rest (Slack webhook URLs). */
  ENCRYPTION_KEY_B64: base64Key(32),

  AWS_REGION: z.string().default('us-east-1'),
  SQS_QUEUE_URL: z.url(),
  SQS_DLQ_URL: z.url(),

  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule: fail fast at boot, and never echo secret values in the error. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
