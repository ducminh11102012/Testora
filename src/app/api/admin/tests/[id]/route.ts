import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { normaliseContent } from '@/lib/parse/normalize';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const test = tests.byId(params.id);
  if (!test || !sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...test, content: JSON.parse(test.content) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const test = tests.byId(params.id);
  if (!test || !sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if (body.visibility) patch.visibility = body.visibility;
  if (body.priceCredits !== undefined) patch.priceCredits = Number(body.priceCredits) || 0;
  if (body.content) {
    try {
      const { content } = normaliseContent(body.content);
      patch.content = JSON.stringify(content);
      patch.title = content.title;
      patch.module = content.module;
      patch.variant = content.variant ?? 'academic';
      patch.durationMin = content.durationMinutes;
    } catch (err) {
      return NextResponse.json({ error: `The paper could not be saved: ${(err as Error).message}` }, { status: 400 });
    }
  }
  const updated = tests.update(params.id, patch);
  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const test = tests.byId(params.id);
  if (!test || !sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  tests.remove(params.id);
  return NextResponse.json({ ok: true });
}
