import { NextRequest, NextResponse } from 'next/server';
import { imports } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { startCompose } from '@/lib/import-runner';
import { isConfigured, loadAiConfig } from '@/lib/ai/config';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "No paper? Have one written." Staff describe what they want — the level, the
 * task types, the number of questions, optionally a paper to imitate — and the
 * model writes it in the background, ending up in the bank like any import.
 */
export async function POST(req: NextRequest) {
  // Writing a paper is teaching work, like importing one.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;

  const config = await loadAiConfig('parse');
  if (!isConfigured(config)) {
    return NextResponse.json({
      error: 'No AI provider is configured, so a paper cannot be written. A platform administrator can set one up under Platform → AI.',
    }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const instructions = String(body.instructions ?? '').trim();
  if (instructions.length < 10) {
    return NextResponse.json({
      error: 'Say what you want the paper to be: the subject, the level, the kind of tasks, how long it should take.',
    }, { status: 400 });
  }

  const title = String(body.title ?? '').trim() || 'Paper written to order';
  const record = await imports.create({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    filename: title,
    mimeType: 'text/plain',
    sizeBytes: instructions.length,
    strategy: 'ai',
    kind: 'generate',
    instructions,
  });

  startCompose(record, {
    orgId: ctx.org.id,
    userId: ctx.user.id,
    instructions,
    sample: body.sample ? String(body.sample).slice(0, 60_000) : undefined,
    module: ['reading', 'listening', 'writing', 'mixed'].includes(String(body.module))
      ? (String(body.module) as 'reading' | 'listening' | 'writing' | 'mixed')
      : undefined,
    questions: Number(body.questions) || undefined,
    minutes: Number(body.minutes) || undefined,
    scoring: body.scoring === 'band' ? 'band' : body.scoring === 'points' ? 'points' : undefined,
    paperTitle: title,
    publish: body.publish === true,
    bank: body.bank !== false,
    folder: body.folder ? String(body.folder).trim().slice(0, 80) : undefined,
    writeMissingAnswers: true,
  });

  return NextResponse.json({
    id: record.id,
    status: 'queued',
    message: 'The paper is being written. It appears in your papers when it is done — you can leave this page.',
  }, { status: 202 });
}
