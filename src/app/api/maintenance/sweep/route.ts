import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { sweepExpired } from '@/lib/storage/retention';
import { resumeStalled } from '@/lib/import-runner';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deletes uploads whose retention has run out. Scheduled once a day in
 * vercel.json; the import screen also sweeps opportunistically, so a file whose
 * retention is zero goes the moment its parse finishes rather than waiting for
 * the small hours.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` with its cron requests, so
 * setting that variable is what lets the schedule in; a platform administrator
 * can always run it by hand. A header alone is not trusted: those can be forged.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const fromCron = !!secret && auth === `Bearer ${secret}`;
  const admin = (await readSession())?.isPlatformAdmin;
  if (!fromCron && !admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const purged = await sweepExpired(200);
  // An import whose worker died mid-parse gets another go from the stored copy.
  const resumed = await resumeStalled(5, true);
  return NextResponse.json({ ok: true, purged, resumed });
}
