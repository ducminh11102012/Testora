import { NextResponse } from 'next/server';
import { databaseReady } from '@/lib/db';
import { rootConfigured } from '@/lib/storage/root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is this deployment actually working?
 *
 * For an uptime check, a load balancer, or a person wondering why the site is
 * behaving oddly. It reports on the two things that make the platform unusable
 * when they are wrong — the database and the storage the vault lives in — and
 * says nothing that would help somebody who should not be asking: no versions,
 * no hostnames, no connection strings, no counts.
 */
export async function GET() {
  const started = Date.now();
  const db = await databaseReady();
  const ok = db.ok;

  return NextResponse.json({
    ok,
    database: db.ok ? 'ready' : db.reason,
    storage: rootConfigured() ? 'configured' : 'unconfigured',
    ms: Date.now() - started,
  }, {
    status: ok ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
