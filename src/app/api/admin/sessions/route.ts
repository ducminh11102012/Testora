import { NextRequest, NextResponse } from 'next/server';
import { sittings, suites, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({
    sessions: await Promise.all(
      (await sittings.listOrg(ctx.org.id)).map(async (s) => ({ ...s, attempts: await sittings.attemptCount(s.id) })),
    ),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));

  // A sitting opens either one paper or a whole full test; the candidate who
  // types the code lands on the paper or on the test's hub accordingly.
  const suite = body.suiteId ? await suites.byId(String(body.suiteId)) : null;
  const test = !suite && body.testId ? await tests.byId(String(body.testId)) : null;
  if (suite && !await sameOrg(ctx, suite.orgId)) {
    return NextResponse.json({ error: 'That full test belongs to another organisation.' }, { status: 404 });
  }
  if (!suite && (!test || !await sameOrg(ctx, test.orgId))) {
    return NextResponse.json({ error: 'Choose a paper or a full test first.' }, { status: 400 });
  }

  const sitting = await sittings.create({
    orgId: ctx.org.id,
    testId: test?.id ?? null,
    suiteId: suite?.id ?? null,
    name: String(body.name || `${(suite ?? test)!.title} sitting`),
    opensAt: body.opensAt || null,
    closesAt: body.closesAt || null,
    durationMin: Number(body.durationMin) || 0,
    settings: body.settings ?? {},
  });
  return NextResponse.json({ ok: true, id: sitting.id, code: sitting.accessCode });
}
