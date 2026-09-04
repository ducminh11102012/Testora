import { NextRequest, NextResponse } from 'next/server';
import { sittings } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const sitting = await sittings.byId(params.id);
  if (!sitting || !await sameOrg(ctx, sitting.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'status', 'opensAt', 'closesAt'] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.durationMin !== undefined) patch.durationMin = Number(body.durationMin) || 0;
  if (body.settings) patch.settings = JSON.stringify({ ...JSON.parse(sitting.settings), ...body.settings });

  await sittings.update(params.id, patch);
  return NextResponse.json({ ok: true });
}

/**
 * A sitting can be deleted without touching the papers or the attempts: the
 * attempts keep their own record and simply stop belonging to a sitting. The
 * count is still reported, so nobody deletes a live sitting by accident.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const sitting = await sittings.byId(params.id);
  if (!sitting || !await sameOrg(ctx, sitting.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sat = await sittings.attemptCount(params.id);
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (sat > 0 && !force) {
    return NextResponse.json({
      error: `${sat} candidate${sat === 1 ? ' has' : 's have'} sat this sitting. Their results are kept, `
        + 'but the sitting and its code disappear. Confirm to delete it.',
      needsConfirmation: true,
      attempts: sat,
    }, { status: 409 });
  }

  await sittings.remove(params.id);
  return NextResponse.json({ ok: true });
}
