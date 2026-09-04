import { headers } from 'next/headers';
import { users } from './db';
import { readSession } from './auth';
import { verificationRequired } from './mail/config';
import { rootConfigured } from './storage/root';

/**
 * Two things have to be true before the platform is usable: an administrator
 * exists, and — once a mail server is configured — the signed-in account has a
 * verified address. Both are checked in the root layout, which is the only
 * place that sees every page.
 */

/** Storage first, then the administrator: the two steps of a first run. */
export async function setupStep(): Promise<'storage' | 'admin' | null> {
  if (!rootConfigured()) return 'storage';
  if ((await users.platformAdminCount()) === 0) return 'admin';
  return null;
}

/** No storage or no administrator yet: the very first visit after a deploy. */
export async function setupNeeded(): Promise<boolean> {
  return (await setupStep()) !== null;
}

const OPEN_PREFIXES = ['/setup', '/verify', '/api', '/_next'];

/** Where this request has to go instead, or null to render the page. */
export async function gateRedirect(): Promise<string | null> {
  const path = headers().get('x-pathname') ?? '/';
  const open = OPEN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (await setupNeeded()) return path.startsWith('/setup') ? null : '/setup';
  if (path.startsWith('/setup')) return '/';
  if (open) return null;

  // An account made before the mail server existed has no address on file.
  // Turning verification on sends it here to add one.
  const session = await readSession();
  if (!session) return null;
  if (!(await verificationRequired())) return null;
  const account = await users.byId(session.id);
  if (account && (!account.email || !account.emailVerifiedAt)) return '/verify';
  return null;
}
