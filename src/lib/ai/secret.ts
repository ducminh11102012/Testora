import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { sessionSecret } from '../session-secret';

/**
 * API keys are entered in the console and stored in the database, so they are
 * encrypted at rest with a key derived from SESSION_SECRET. Rotating that
 * secret invalidates stored keys, which is the intended behaviour: they have to
 * be re-entered rather than silently decrypting with a compromised secret.
 */

const KEY = () => scryptSync(Buffer.from(sessionSecret()), 'testora.ai.v1', 32);

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  const [version, iv, tag, body] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !body) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Never send a key back to the browser — send this instead. */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return `${plain.slice(0, 3)}••••••••${plain.slice(-4)}`;
}
