import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret } from './secret-box';

const key = randomBytes(32);
const url = 'https://hooks.slack.com/services/T000/B000/XXXX';

describe('secret box', () => {
  it('round-trips and never stores the plaintext', () => {
    const sealed = encryptSecret(url, key);
    expect(sealed).not.toContain('hooks.slack.com');
    expect(decryptSecret(sealed, key)).toBe(url);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret(url, key)).not.toBe(encryptSecret(url, key));
  });

  it('rejects tampered ciphertext and the wrong key', () => {
    const parts = encryptSecret(url, key).split('.');
    const ct = Buffer.from(parts[3]!, 'base64url');
    ct[0]! ^= 1;
    parts[3] = ct.toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
    expect(() => decryptSecret(encryptSecret(url, key), randomBytes(32))).toThrow();
  });
});
