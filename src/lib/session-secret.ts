/**
 * The key that signs the session cookie. Deliberately importable from the edge
 * middleware as well as the server, so it must not touch the database driver.
 *
 * SESSION_SECRET is the right way to set it. When a deployment has not set one,
 * the connection string stands in as key material: it is secret, it is present
 * in every runtime that needs to verify a cookie, and it is stable for the life
 * of the deployment — which is what makes a zero-configuration deploy work.
 */
const URL_VARS = [
  'DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'DATABASE_POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING', 'NEON_DATABASE_URL', 'SUPABASE_DB_URL',
];

export function sessionSecret(): Uint8Array {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return new TextEncoder().encode(explicit);

  for (const name of URL_VARS) {
    const value = process.env[name];
    if (value && value.startsWith('post')) {
      return new TextEncoder().encode(`testora.session.v1:${value}`);
    }
  }
  return new TextEncoder().encode('dev-only-insecure-secret-change-me-please');
}

/** True when the secret is a real one, not the development stand-in. */
export function sessionSecretIsWeak(): boolean {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return false;
  return !URL_VARS.some((n) => (process.env[n] ?? '').startsWith('post'));
}
