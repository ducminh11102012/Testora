import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
