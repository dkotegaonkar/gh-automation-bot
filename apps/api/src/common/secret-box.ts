import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

const VERSION = 'v1';

/** AES-256-GCM. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url). Tampering fails authentication. */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, ...[iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url'))].join('.');
}

export function decryptSecret(sealed: string, key: Buffer): string {
  const [version, iv, tag, ct] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('unrecognized ciphertext format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

@Injectable()
export class SecretBox {
  private readonly key: Buffer;

  constructor(config: AppConfig) {
    const keyB64: string = config.get('ENCRYPTION_KEY_B64');
    this.key = Buffer.from(keyB64, 'base64');
  }

  seal(plain: string) {
    return encryptSecret(plain, this.key);
  }

  open(sealed: string) {
    return decryptSecret(sealed, this.key);
  }
}

@Global()
@Module({ providers: [SecretBox], exports: [SecretBox] })
export class SecretBoxModule {}
