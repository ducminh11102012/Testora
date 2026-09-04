import { NextRequest, NextResponse } from 'next/server';
import { accessCodes } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ codes: await accessCodes.list(ctx.org.id) });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const { credits, maxUses, quantity, testId, note, expiresAt } = await req.json().catch(() => ({}));
  const n = Math.min(200, Math.max(1, Number(quantity) || 1));
  const created = await Promise.all(Array.from({ length: n }, () => accessCodes.create({
    orgId: ctx.org.id,
    testId: testId || null,
    credits: Number(credits) || 0,
    maxUses: Number(maxUses) || 1,
    note: note ? String(note) : '',
    expiresAt: expiresAt || null,
  })));
  return NextResponse.json({ ok: true, codes: created.map((c) => c.code) });
}

export async function DELETE(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const { id } = await req.json().catch(() => ({}));
  const mine = (await accessCodes.list(ctx.org.id)).some((c) => c.id === id);
  if (!mine) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await accessCodes.remove(String(id));
  return NextResponse.json({ ok: true });
}
