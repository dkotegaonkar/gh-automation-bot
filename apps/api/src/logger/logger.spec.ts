import { redactQuery } from './logger.module';

describe('redactQuery', () => {
  it('removes OAuth code and state from logged URLs', () => {
    expect(redactQuery('/api/auth/github/callback?code=abc123&state=xyz&installation_id=9')).toBe(
      '/api/auth/github/callback?code=[redacted]&state=[redacted]&installation_id=9',
    );
  });
});
