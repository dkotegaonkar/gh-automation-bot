import { createHmac } from 'node:crypto';
import { verifyGithubSignature } from './signature';

const secret = 'test-webhook-secret';
const body = Buffer.from(JSON.stringify({ action: 'opened', issue: { title: 'bug: crash' } }));
const sign = (b: Buffer, s = secret) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`;

describe('verifyGithubSignature', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyGithubSignature(secret, body, sign(body))).toBe(true);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false);
    expect(verifyGithubSignature(secret, body, '')).toBe(false);
    expect(verifyGithubSignature(secret, body, sign(body).replace('sha256=', 'sha1='))).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyGithubSignature(secret, body, sign(body, 'attacker-secret'))).toBe(false);
  });

  it('rejects a tampered body even by one byte', () => {
    const tampered = Buffer.from(body.toString().replace('crash', 'crasH'));
    expect(verifyGithubSignature(secret, tampered, sign(body))).toBe(false);
  });

  it('rejects a re-serialized body (must verify raw bytes, not parsed JSON)', () => {
    const pretty = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verifyGithubSignature(secret, pretty, sign(body))).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyGithubSignature(secret, body, sign(body).slice(0, 20))).toBe(false);
  });
});
