import { NextRequest, NextResponse } from 'next/server';
import { imports, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { normaliseContent } from '@/lib/parse/normalize';
import { importStage } from '@/lib/import-runner';
import { purgeImport } from '@/lib/storage/retention';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const record = await imports.byId(params.id);
  if (!record || !await sameOrg(ctx, record.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  /*
   * `extractedText` is up to a megabyte and a half of the uploaded book, kept
   * so a paused run can carry on. The console has no use for it, and sending it
   * turns opening one import into a megabyte download.
   */
  const { extractedText, ...rest } = record;
  return NextResponse.json({
    ...rest,
    extractedChars: extractedText?.length ?? 0,
    stage: importStage(record).label,
    draft: record.draft ? JSON.parse(record.draft) : null,
    warnings: JSON.parse(record.warnings || '[]'),
  });
}

/** Turns a reviewed draft into a paper in this organisation's bank. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Same rule as the upload: a teacher may turn their own import into a paper.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const record = await imports.byId(params.id);
  if (!record || !await sameOrg(ctx, record.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const source = body.content ?? (record.draft ? JSON.parse(record.draft) : null);
  if (!source) return NextResponse.json({ error: 'There is nothing to save.' }, { status: 400 });

  const { content } = normaliseContent(source);
  const test = await tests.create({
    orgId: ctx.org.id,
    title: content.title,
    module: content.module,
    variant: content.variant ?? 'academic',
    durationMin: content.durationMinutes,
    status: body.publish ? 'published' : 'draft',
    content: JSON.stringify(content),
  });
  await imports.update(record.id, { status: 'committed', testId: test.id });
  return NextResponse.json({ ok: true, testId: test.id });
}

/**
 * Removes an import from the log. The paper it produced stays: it is a paper of
 * its own by now, deleted from the papers screen if it is not wanted.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const record = await imports.metaById(params.id);
  if (!record || !await sameOrg(ctx, record.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Any copy of the original goes with it.
  if (record.storageKey) await purgeImport(record).catch(() => undefined);
  await imports.remove(params.id);
  return NextResponse.json({ ok: true });
}
