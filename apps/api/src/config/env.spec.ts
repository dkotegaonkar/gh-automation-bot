import { validateEnv } from './env';

const valid = {
  WEB_URL: 'https://app.example.com',
  API_URL: 'https://api.example.com',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  GITHUB_APP_ID: '1',
  GITHUB_APP_SLUG: 'bot',
  GITHUB_APP_PRIVATE_KEY_B64: 'a2V5',
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'super-secret-client-value',
  GITHUB_WEBHOOK_SECRET: 'webhook-secret-123456',
  SESSION_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY_B64: Buffer.alloc(32).toString('base64'),
  SQS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/1/q',
  SQS_DLQ_URL: 'https://sqs.us-east-1.amazonaws.com/1/dlq',
};

describe('validateEnv', () => {
  it('accepts a complete config and applies defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.GROQ_MODEL).toBeTruthy();
  });

  it('rejects a bad encryption key without echoing secret values', () => {
    const run = () => validateEnv({ ...valid, ENCRYPTION_KEY_B64: 'short', GITHUB_WEBHOOK_SECRET: 'tooshort' });
    expect(run).toThrow(/ENCRYPTION_KEY_B64/);
    expect(run).toThrow(/GITHUB_WEBHOOK_SECRET/);
    expect(run).not.toThrow(/tooshort|super-secret-client-value/);
  });
});
