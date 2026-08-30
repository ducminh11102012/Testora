import { NextRequest, NextResponse } from 'next/server';
import { sittings, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({
    sessions: sittings.listOrg(ctx.org.id).map((s) => ({ ...s, attempts: sittings.attemptCount(s.id) })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const test = tests.byId(String(body.testId ?? ''));
  if (!test || !sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Choose a paper first.' }, { status: 400 });

  const sitting = sittings.create({
    orgId: ctx.org.id,
    testId: test.id,
    name: String(body.name || `${test.title} sitting`),
    opensAt: body.opensAt || null,
    closesAt: body.closesAt || null,
    durationMin: Number(body.durationMin) || 0,
    settings: body.settings ?? {},
  });
  return NextResponse.json({ ok: true, id: sitting.id, code: sitting.accessCode });
}
