import { NextRequest, NextResponse } from 'next/server';
import { sittings } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const sitting = sittings.byId(params.id);
  if (!sitting || !sameOrg(ctx, sitting.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of ['name', 'status', 'opensAt', 'closesAt'] as const) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  if (body.durationMin !== undefined) patch.durationMin = Number(body.durationMin) || 0;
  if (body.settings) patch.settings = JSON.stringify({ ...JSON.parse(sitting.settings), ...body.settings });

  sittings.update(params.id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const sitting = sittings.byId(params.id);
  if (!sitting || !sameOrg(ctx, sitting.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  sittings.remove(params.id);
  return NextResponse.json({ ok: true });
}
