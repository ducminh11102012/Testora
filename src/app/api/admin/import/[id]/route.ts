import { NextRequest, NextResponse } from 'next/server';
import { imports, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { normaliseContent } from '@/lib/parse/normalize';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const record = imports.byId(params.id);
  if (!record || !sameOrg(ctx, record.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...record,
    draft: record.draft ? JSON.parse(record.draft) : null,
    warnings: JSON.parse(record.warnings),
  });
}

/** Turns a reviewed draft into a paper in this organisation's bank. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const record = imports.byId(params.id);
  if (!record || !sameOrg(ctx, record.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const source = body.content ?? (record.draft ? JSON.parse(record.draft) : null);
  if (!source) return NextResponse.json({ error: 'There is nothing to save.' }, { status: 400 });

  const { content } = normaliseContent(source);
  const test = tests.create({
    orgId: ctx.org.id,
    title: content.title,
    module: content.module,
    variant: content.variant ?? 'academic',
    durationMin: content.durationMinutes,
    status: body.publish ? 'published' : 'draft',
    content: JSON.stringify(content),
  });
  imports.update(record.id, { status: 'committed', testId: test.id });
  return NextResponse.json({ ok: true, testId: test.id });
}
