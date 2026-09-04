import { NextRequest, NextResponse } from 'next/server';
import {
  attempts, memberships, orgs, settingsOf, sittings, suiteSettingsOf, suites, tests, users,
} from '@/lib/db';
import { readSession } from '@/lib/auth';
import { ExamContent } from '@/types/exam';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let sitting = sittingCode ? await sittings.byCode(sittingCode) : null;
  if (sittingCode && !sitting) return NextResponse.json({ error: 'That exam code was not recognised.' }, { status: 404 });

  // A suite start names the skill instead of the paper.
  const suite = body.suiteId ? await suites.byId(String(body.suiteId)) : null;

  /*
   * A full test is sat one section at a time, and the code is typed once. The
   * candidate's earlier sections therefore remember which sitting this is, and
   * the later ones inherit it — otherwise the second and third sections would
   * be recorded as private practice, escaping the sitting's window, its
   * invigilation rules and its one-attempt limit.
   */
  /*
   * This candidate's attempts at this full test, read once and reused. The
   * questions below — is there a sitting to inherit, has this section been sat,
   * is there a live practice run, has the test been paid for — were each doing
   * their own copy of the same query, and every copy dragged the papers along
   * with it.
   */
  const mineAtSuite = suite ? await attempts.listForSuite(suite.id, user.id) : [];

  if (suite && !sitting) {
    const mine = mineAtSuite;
    const earlier = mine.find((a) => a.sessionId);
    if (earlier?.sessionId) sitting = await sittings.byId(earlier.sessionId);
    if (!sitting) {
      const open = (await sittings.forSuite(suite.id)).find((s) => s.status !== 'closed');
      if (open) sitting = open;
    }
  }
  const suiteItem = suite && body.skill
    ? suites.itemsOf(suite).find((i) => i.skill === body.skill && i.mode === 'online')
    : null;
  if (body.suiteId && !suiteItem) {
    return NextResponse.json({ error: 'That section is not part of this test.' }, { status: 404 });
  }

  /*
   * Practice is the candidate's own rehearsal: one section on its own, for as
   * long as they like, as often as they like, and kept out of the test's
   * report. Simulation is the real thing. A sitting is always the real thing,
   * whatever was asked for — an invigilated exam is not practice.
   */
  const suiteRules = suite ? suiteSettingsOf(suite) : null;
  const wantsPractice = String(body.mode ?? '') === 'practice';
  const practice = wantsPractice && !!suite && !sitting && suiteRules!.allowPractice;
  if (wantsPractice && !practice) {
    return NextResponse.json({
      error: suite
        ? sitting
          ? 'This test is being sat under exam conditions, so it cannot be practised.'
          : 'Practice is switched off for this test.'
        : 'Practice is for a section of a full test.',
    }, { status: 403 });
  }
  if (suite && !practice && suiteRules && !suiteRules.allowSimulation && !sitting) {
    return NextResponse.json({
      error: 'This test is set up for practice only — choose a section and a length instead.',
    }, { status: 403 });
  }

  // A suite is a paper like any other: it opens to the world only when it is
  // published in the catalogue. Anything else needs membership of its
  // organisation, which is the same rule the suite page applies.
  if (suite) {
    const suiteOpen = suite.visibility === 'catalog' && suite.status === 'published';
    if (!suiteOpen && !user.isPlatformAdmin && !await memberships.find(user.id, suite.orgId)) {
      return NextResponse.json({ error: 'You do not have access to this test.' }, { status: 403 });
    }
  }

  // A sitting for a whole full test has no single paper: the candidate is sent
  // to the test's hub and starts each section from there, carrying the code.
  if (sitting?.suiteId && !body.suiteId) {
    if (sitting.status === 'closed') return NextResponse.json({ error: 'This sitting is closed.' }, { status: 403 });
    if (!await memberships.find(user.id, sitting.orgId)) {
      await memberships.upsert(user.id, sitting.orgId, 'candidate');
    }
    return NextResponse.json({ suiteId: sitting.suiteId, code: sitting.accessCode, sitting: sitting.name });
  }
  if (sitting && body.suiteId && sitting.suiteId && sitting.suiteId !== String(body.suiteId)) {
    return NextResponse.json({ error: 'That code is for a different test.' }, { status: 403 });
  }

  const testId = suiteItem?.testId ?? (sitting ? sitting.testId : String(body.testId ?? ''));
  const test = await tests.byId(testId ?? '');
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
    if (!await memberships.find(user.id, sitting.orgId)) await memberships.upsert(user.id, sitting.orgId, 'candidate');
  }

  // --- entitlement ---------------------------------------------------------
  const member = await memberships.find(user.id, test.orgId);
  const isCatalogue = (test.visibility === 'catalog' && test.status === 'published')
    || (!!suite && suite.visibility === 'catalog' && suite.status === 'published');
  let spend = 0;

  if (!sitting && !suite && !member && !isCatalogue) {
    return NextResponse.json({ error: 'You do not have access to this paper.' }, { status: 403 });
  }
  // A sitting-only paper is exactly that: no code, no paper, whoever you are.
  if (test.visibility === 'sitting' && !sitting && !suite) {
    return NextResponse.json({
      error: 'This paper opens only through a sitting. Enter the code your centre gave you.',
    }, { status: 403 });
  }
  // A paper held behind a full test is sat as a section of that test, never on
  // its own — which is what a centre asks for when it hides a paper.
  if (test.visibility === 'suite' && !sitting && !suite) {
    return NextResponse.json({
      error: 'This paper is part of a full test. Open the full test and start it from there.',
    }, { status: 403 });
  }
  if (!sitting && !suite && test.status !== 'published' && !user.isPlatformAdmin) {
    return NextResponse.json({ error: 'This paper is not open.' }, { status: 403 });
  }

  if (sitting) {
    const rules = JSON.parse(sitting.settings || '{}') as { singleAttempt?: boolean };
    if (rules.singleAttempt) {
      // One targeted row, rather than every attempt in the sitting — with its
      // paper attached — filtered down to this candidate afterwards.
      const finished = await attempts.finishedInSession(sitting.id, user.id);
      if (finished) {
        return NextResponse.json({
          error: 'This sitting allows one attempt, and yours has been handed in.',
        }, { status: 409 });
      }
    }
  }

  // Each skill of a suite may only be sat once, and a live attempt resumes.
  // Practice is exempt: rehearsing a section twice is the point of it.
  if (suite && practice) {
    const live = mineAtSuite
      .find((a) => a.skill === suiteItem!.skill && a.mode === 'practice' && a.status === 'in_progress'
        && (a.untimed === 1 || new Date(a.endsAt).getTime() > Date.now()));
    if (live) return NextResponse.json({ attemptId: live.id, resumed: true, practice: true });
  } else if (suite) {
    const already = mineAtSuite
      .find((a) => a.skill === suiteItem!.skill && a.mode !== 'practice');
    if (already) {
      if (already.status === 'in_progress' && new Date(already.endsAt).getTime() > Date.now()) {
        return NextResponse.json({ attemptId: already.id, resumed: true });
      }
      return NextResponse.json({ error: 'You have already sat this section.' }, { status: 409 });
    }
  } else {
    const existing = await attempts.activeFor(test.id, user.id);
    if (existing && new Date(existing.endsAt).getTime() > Date.now()) {
      return NextResponse.json({ attemptId: existing.id, resumed: true });
    }
  }

  // A suite charges once, on the first section.
  const price = suite ? suite.priceCredits : test.priceCredits;
  const alreadyPaid = suite ? mineAtSuite.length > 0 : false;
  if (!sitting && isCatalogue && !member && price > 0 && !alreadyPaid) {
    const account = await users.byId(user.id);
    if (!account || account.credits < price) {
      return NextResponse.json(
        { error: `This test costs ${price} credit(s). Redeem a code or top up to continue.`, needCredits: true },
        { status: 402 },
      );
    }
    spend = price;
  }

  const content = JSON.parse(test.content) as ExamContent;
  const org = await orgs.byId(test.orgId);
  const settings = settingsOf(org);
  // Zero minutes anywhere in the chain means "no time limit": the paper stated
  // none, or the centre chose none. The attempt still needs an end date for the
  // database, so it gets one nobody will reach, and the exam screen is told to
  // hide the clock instead of counting down to it.
  const stated = suiteItem?.durationMin ?? 0;
  /*
   * Practice runs for as long as the candidate asked for — including no limit
   * at all, which is what 0 means everywhere else on the platform. A centre may
   * cap it, and a cap of 0 means they did not.
   */
  const asked = Math.max(0, Math.round(Number(body.minutes) || 0));
  const cap = suiteRules?.practiceMaxMinutes ?? 0;
  const practiceMinutes = practice
    ? (cap > 0 ? Math.min(asked || cap, cap) : asked)
    : 0;
  const minutes = practice
    ? practiceMinutes
    : stated || sitting?.durationMin || content.durationMinutes || test.durationMin || 0;
  const untimed = minutes <= 0;
  const endsAt = untimed
    ? new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString()
    : new Date(Date.now() + minutes * 60_000).toISOString();

  /*
   * Take the credits before creating the attempt, in one statement that only
   * succeeds if the balance is really there.
   *
   * The old order — create the attempt, then debit — meant a failed debit left
   * a live attempt behind, and the candidate could simply retry and resume it
   * for nothing. Two simultaneous starts could also both pass the balance check
   * before either had spent.
   */
  if (spend > 0) {
    const paid = await users.spendCredits(user.id, spend);
    if (!paid) {
      return NextResponse.json(
        { error: `This test costs ${spend} credit(s), and your balance has changed. Top up and try again.`, needCredits: true },
        { status: 402 },
      );
    }
  }

  let attempt;
  try {
    attempt = await attempts.create({
      orgId: suite ? suite.orgId : (sitting ? sitting.orgId : test.orgId),
      testId: test.id,
      userId: user.id,
      sessionId: sitting?.id ?? null,
      suiteId: suite?.id ?? null,
      skill: suiteItem?.skill ?? null,
      endsAt,
      untimed,
      mode: practice ? 'practice' : 'exam',
    });
  } catch (err) {
    // Nothing was sat, so nothing should have been paid for.
    if (spend > 0) await users.addCredits(user.id, spend);
    throw err;
  }

  return NextResponse.json({
    attemptId: attempt.id,
    resumed: false,
    untimed,
    practice,
    spent: spend,
    settings: sitting ? JSON.parse(sitting.settings) : settings,
  });
}
