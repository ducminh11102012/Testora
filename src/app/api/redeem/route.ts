import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { redeemCode } from '@/lib/redeem';
import { memberships, orgs, sittings } from '@/lib/db';
import { callerKey, take } from '@/lib/rate-limit';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One box on the Join page accepts both sitting codes and credit codes. */
export async function POST(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Sign in first, then enter your code.' }, { status: 401 });

  const { code } = await req.json().catch(() => ({}));
  const value = String(code ?? '').trim().toUpperCase();
  if (!value) return NextResponse.json({ error: 'Enter a code.' }, { status: 400 });

  /*
   * A code is eight characters, which is guessable if you are allowed to guess
   * quickly. Twenty tries a minute is plenty for somebody reading one off a
   * printed slip and far too few to work through the space.
   */
  const verdict = take(`redeem:${user.id}`, { limit: 20, windowSec: 60 });
  if (!verdict.ok) {
    return NextResponse.json({
      error: 'That is a lot of codes in a short time. Wait a minute and try again.',
      retryAfter: verdict.retryAfter,
    }, { status: 429, headers: { 'retry-after': String(verdict.retryAfter) } });
  }

  // A join code enrols the account in an organisation and keeps it there.
  const joinOrg = await orgs.byJoinCode(value);
  if (joinOrg) {
    const already = await memberships.find(user.id, joinOrg.id);
    if (!already) await memberships.upsert(user.id, joinOrg.id, 'candidate');
    return NextResponse.json({
      ok: true, kind: 'membership', orgName: joinOrg.name, already: !!already,
    });
  }

  const sitting = await sittings.byCode(value);
  if (sitting) return NextResponse.json({ ok: true, kind: 'sitting', sittingId: sitting.id, testTitle: sitting.testTitle });

  const result = await redeemCode(user.id, value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, kind: 'credit', credits: result.credits, testId: result.testId });
}
