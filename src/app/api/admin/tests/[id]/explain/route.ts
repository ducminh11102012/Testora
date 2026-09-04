import { NextRequest, NextResponse } from 'next/server';
import { imports, tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { ExamContent } from '@/types/exam';
import { explanationCoverage } from '@/lib/ai/explain';
import { startExplain } from '@/lib/import-runner';
import { isConfigured, loadAiConfig } from '@/lib/ai/config';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many answers on this paper carry an explanation. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(explanationCoverage(JSON.parse(test.content) as ExamContent));
}

/**
 * Writes the answer explanations for a paper already in the bank.
 *
 * Papers imported before explanations existed have none, and a teacher who did
 * not tick the box at upload time should not have to import the paper again. It
 * runs in the background like an import, so the console can watch it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const config = await loadAiConfig('parse');
  if (!isConfigured(config)) {
    return NextResponse.json({
      error: 'No AI provider is configured, so explanations cannot be written. A platform administrator can set one up under Platform → AI.',
    }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const coverage = explanationCoverage(JSON.parse(test.content) as ExamContent);
  if (!coverage.possible) {
    return NextResponse.json({
      error: 'There is nothing to explain on this paper — its questions have no answer key yet, or they are all writing tasks.',
    }, { status: 409 });
  }
  if (coverage.written >= coverage.possible && body.redo !== true) {
    return NextResponse.json({
      error: 'Every answer on this paper already has an explanation. Ask again with "redo" to rewrite them.',
      coverage,
    }, { status: 409 });
  }

  const record = await imports.create({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    filename: `Explanations — ${test.title}`,
    mimeType: 'text/plain',
    sizeBytes: 0,
    strategy: 'ai',
    kind: 'generate',
    instructions: `Answer explanations for ${test.title}`,
  });

  startExplain(record, {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    testId: test.id,
    redo: body.redo === true,
  });

  return NextResponse.json({
    id: record.id,
    status: 'queued',
    coverage,
    message: `Writing explanations for ${coverage.possible - coverage.written} answer(s). `
      + 'It runs in the background — you can leave this page.',
  }, { status: 202 });
}
