import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies GitHub's X-Hub-Signature-256 header against the exact raw request bytes.
 * Constant-time comparison so the check leaks nothing about the expected value.
 */
export function verifyGithubSignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
