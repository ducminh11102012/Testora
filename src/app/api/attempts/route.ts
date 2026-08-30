import { NextRequest, NextResponse } from 'next/server';
import { attempts, memberships, orgs, settingsOf, sittings, tests, users } from '@/lib/db';
import { readSession } from '@/lib/auth';
import { ExamContent } from '@/types/exam';

/**
 * Starts (or resumes) an attempt. Entry is granted by one of three routes:
 * a sitting code, membership of the owning organisation, or credits spent on a
 * catalogue paper.
 */
export async function POST(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sittingCode = body.code ? String(body.code).trim().toUpperCase() : null;

  const sitting = sittingCode ? sittings.byCode(sittingCode) : null;
  if (sittingCode && !sitting) return NextResponse.json({ error: 'That exam code was not recognised.' }, { status: 404 });

  const testId = sitting ? sitting.testId : String(body.testId ?? '');
  const test = tests.byId(testId);
  if (!test) return NextResponse.json({ error: 'Test not found.' }, { status: 404 });

  // --- window --------------------------------------------------------------
  if (sitting) {
    const now = Date.now();
    if (sitting.status === 'closed') return NextResponse.json({ error: 'This sitting is closed.' }, { status: 403 });
    if (sitting.opensAt && new Date(sitting.opensAt).getTime() > now) {
      return NextResponse.json({ error: `This sitting opens at ${new Date(sitting.opensAt).toLocaleString()}.` }, { status: 403 });
    }
    if (sitting.closesAt && new Date(sitting.closesAt).getTime() < now) {
      return NextResponse.json({ error: 'This sitting has already closed.' }, { status: 403 });
    }
    if (!memberships.find(user.id, sitting.orgId)) memberships.upsert(user.id, sitting.orgId, 'candidate');
  }

  // --- entitlement ---------------------------------------------------------
  const member = memberships.find(user.id, test.orgId);
  const isCatalogue = test.visibility === 'catalog' && test.status === 'published';
  let spend = 0;

  if (!sitting && !member && !isCatalogue) {
    return NextResponse.json({ error: 'You do not have access to this paper.' }, { status: 403 });
  }
  if (!sitting && test.status !== 'published' && !user.isPlatformAdmin) {
    return NextResponse.json({ error: 'This paper is not open.' }, { status: 403 });
  }

  const existing = attempts.activeFor(test.id, user.id);
  if (existing && new Date(existing.endsAt).getTime() > Date.now()) {
    return NextResponse.json({ attemptId: existing.id, resumed: true });
  }

  if (!sitting && isCatalogue && !member && test.priceCredits > 0) {
    const account = users.byId(user.id);
    if (!account || account.credits < test.priceCredits) {
      return NextResponse.json(
        { error: `This paper costs ${test.priceCredits} credit(s). Redeem a code or top up to continue.`, needCredits: true },
        { status: 402 },
      );
    }
    spend = test.priceCredits;
  }

  const content = JSON.parse(test.content) as ExamContent;
  const org = orgs.byId(test.orgId);
  const settings = settingsOf(org);
  const minutes = sitting?.durationMin || content.durationMinutes || test.durationMin || 60;

  const attempt = attempts.create({
    orgId: sitting ? sitting.orgId : test.orgId,
    testId: test.id,
    userId: user.id,
    sessionId: sitting?.id ?? null,
    endsAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  });

  if (spend > 0) users.addCredits(user.id, -spend);

  return NextResponse.json({
    attemptId: attempt.id,
    resumed: false,
    spent: spend,
    settings: sitting ? JSON.parse(sitting.settings) : settings,
  });
}
