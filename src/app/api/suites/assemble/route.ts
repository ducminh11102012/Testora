import { NextResponse } from 'next/server';
import { memberships, orgs, settingsOf, suites } from '@/lib/db';
import { readSession } from '@/lib/auth';
import { assembleSuites, bankSummary } from '@/lib/assemble';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many tests a candidate may have drawn for them in a day. */
const DAILY_LIMIT = 5;

/**
 * "Can't decide what to sit? We'll pick one." Draws a full test out of the bank
 * of a school the candidate belongs to — or, failing that, the public one — and
 * puts it on their dashboard for them alone.
 */
export async function POST() {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mine = await memberships.of(user.id);
  const platform = await orgs.platform();
  const candidates = [...mine.map((m) => m.orgId), ...(platform ? [platform.id] : [])]
    .filter((orgId, i, list) => list.indexOf(orgId) === i);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const drawnToday = (await suites.assembledFor(user.id))
    .filter((s) => new Date(s.createdAt).getTime() >= today.getTime()).length;
  if (drawnToday >= DAILY_LIMIT) {
    return NextResponse.json({
      error: `You have had ${DAILY_LIMIT} tests drawn for you today. Sit one of those first — they are on your dashboard.`,
    }, { status: 429 });
  }

  let refused = 0;
  let empty = 0;
  for (const orgId of candidates) {
    const org = await orgs.byId(orgId);
    if (!org) continue;
    if (!settingsOf(org).allowCandidateAssembly) { refused += 1; continue; }
    const summary = await bankSummary(orgId);
    if (!summary.total) { empty += 1; continue; }

    const result = await assembleSuites({
      orgId,
      count: 1,
      titlePrefix: 'Your practice test',
      publish: true,
      visibility: 'private',
      forUserId: user.id,
    });
    if (result.built.length) {
      // A candidate drawn a test from a school they have not joined needs to be
      // in it to open the test; the public organisation is open to everyone.
      if (!await memberships.find(user.id, orgId)) await memberships.upsert(user.id, orgId, 'candidate');
      return NextResponse.json({
        ok: true,
        suiteId: result.built[0].id,
        title: result.built[0].title,
        description: result.built[0].description,
      });
    }
  }

  // Two different disappointments, and the candidate can act on only one of
  // them: a centre that has switched this off is not going to be fixed by
  // waiting, whereas an empty bank might be filled tomorrow.
  if (refused && !empty) {
    return NextResponse.json({
      error: 'Your centre has not opened this. Pick a paper from the catalogue, or ask them for one.',
    }, { status: 403 });
  }
  return NextResponse.json({
    error: 'There are no papers to draw from yet. Ask your centre to add some, or pick a paper from the catalogue.',
  }, { status: 404 });
}
