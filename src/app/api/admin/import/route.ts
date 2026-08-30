import { NextRequest, NextResponse } from 'next/server';
import { imports } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { Strategy, parseDocument } from '@/lib/parse';

export const maxDuration = 300;
export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is larger than 25 MB.' }, { status: 413 });

  const strategy = String(form.get('strategy') ?? 'hybrid') as Strategy;
  const module = (form.get('module') ? String(form.get('module')) : undefined) as
    'reading' | 'listening' | 'writing' | 'mixed' | undefined;
  const title = form.get('title') ? String(form.get('title')) : undefined;

  const record = imports.create({
    orgId: ctx.org.id,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    strategy,
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const outcome = await parseDocument(file.name, file.type, buffer, { strategy, module, title });

    imports.update(record.id, {
      status: 'parsed',
      provider: outcome.usedAi ? `${outcome.provider}:${outcome.model ?? ''}` : 'rules',
      extractedText: outcome.extracted.text.slice(0, 200_000),
      draft: JSON.stringify(outcome.content),
      warnings: JSON.stringify(outcome.warnings),
      strategy: outcome.strategy,
    });

    return NextResponse.json({
      id: record.id,
      content: outcome.content,
      warnings: outcome.warnings,
      usedAi: outcome.usedAi,
      provider: outcome.provider,
      model: outcome.model,
      ruleConfidence: outcome.ruleConfidence,
      textPreview: outcome.extracted.text.slice(0, 6000),
    });
  } catch (err) {
    const message = (err as Error).message;
    imports.update(record.id, { status: 'failed', error: message });
    return NextResponse.json({ error: message, id: record.id }, { status: 422 });
  }
}

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({ imports: imports.listOrg(ctx.org.id) });
}
