import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { putObject } from '@/lib/storage/client';
import { targetsFor } from '@/lib/storage/vault';
import { ExamContent } from '@/types/exam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Hugging Face takes a file in one commit; anything larger needs a bucket. */
/*
 * The Hub used to take a recording only if it fitted in one base64 commit,
 * which meant nine megabytes — a twenty-minute listening section does not. It
 * goes the git-lfs way now (see src/lib/storage/hf.ts), so the only ceiling
 * left is the one below.
 */
const MAX_BYTES = 60 * 1024 * 1024;

const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav'];

/**
 * Attaches a recording to a listening paper. A parsed listening paper has
 * questions but no sound, so this is what makes it sittable — and publishing is
 * refused until every listening part has something to play.
 *
 * `partId` may be a part, or the word `paper` for one tape covering the whole
 * paper. That second case is the usual one: an examination recording runs from
 * the first section to the last without stopping.
 */
const WHOLE_PAPER = 'paper';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const form = await req.formData();
  const partId = String(form.get('partId') ?? '');
  const link = String(form.get('url') ?? '').trim();
  const file = form.get('file');

  const content = JSON.parse(test.content) as ExamContent;
  const wholePaper = partId === WHOLE_PAPER;
  const part = wholePaper ? null : content.parts.find((p) => p.id === partId);
  if (!wholePaper && !part) {
    return NextResponse.json({ error: 'That part is not in this paper.' }, { status: 404 });
  }
  /** Writes the URL where it belongs, and marks what it applies to. */
  const attachTo = (url: string) => {
    if (wholePaper) {
      content.audioUrl = url;
      content.audioPlayOnce = content.audioPlayOnce !== false;
      // Every listening part is now covered, so nothing else needs marking.
      return;
    }
    part!.audioUrl = url;
    part!.listening = true;
    part!.audioPlayOnce = part!.audioPlayOnce !== false;
  };

  // A centre that already hosts its audio elsewhere just pastes the link.
  if (link) {
    let parsed: URL;
    try { parsed = new URL(link); } catch {
      return NextResponse.json({ error: 'That is not a valid URL.' }, { status: 400 });
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'The link must be an http:// or https:// URL.' }, { status: 400 });
    }
    attachTo(link);
    await tests.update(params.id, { content: JSON.stringify(content) });
    return NextResponse.json({ ok: true, audioUrl: link, scope: wholePaper ? 'paper' : 'part' });
  }

  if (!(file instanceof File)) return NextResponse.json({ error: 'No recording was uploaded.' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That recording is larger than 60 MB. Encode it as 64 kbps mono MP3, or paste a link instead.' }, { status: 413 });
  }
  const type = file.type || 'audio/mpeg';
  if (!AUDIO_TYPES.includes(type) && !/\.(mp3|m4a|aac|ogg|wav)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Upload an MP3, M4A, OGG or WAV file.' }, { status: 415 });
  }

  const usable = await targetsFor(ctx.org.id, ctx.org.kind);
  if (!usable.length) {
    return NextResponse.json({ error: 'No storage is configured, so the recording cannot be kept. Paste a link instead.' }, { status: 409 });
  }
  const targets = usable;

  const key = `audio/${test.orgId}/${test.id}/${wholePaper ? 'paper' : part!.id}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const results = await putObject(targets, key, buffer, type);
  const ok = results.filter((r) => r.ok);
  if (!ok.length) {
    return NextResponse.json({ error: `The recording could not be stored: ${results[0]?.error ?? 'unknown error'}` }, { status: 502 });
  }

  const url = `/api/media?key=${encodeURIComponent(key)}&bucket=${encodeURIComponent(ok[0].bucketId)}`;
  attachTo(url);
  await tests.update(params.id, { content: JSON.stringify(content) });

  return NextResponse.json({
    ok: true,
    audioUrl: url,
    scope: wholePaper ? 'paper' : 'part',
    storedIn: ok.map((r) => r.label),
    warnings: results.filter((r) => !r.ok).map((r) => `${r.label}: ${r.error}`),
  });
}

/**
 * Takes a recording off again — one part's, or the paper's whole tape. The
 * stored file is left for the retention sweep.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const partId = new URL(req.url).searchParams.get('partId') ?? '';
  const content = JSON.parse(test.content) as ExamContent;

  if (partId === WHOLE_PAPER) {
    delete content.audioUrl;
    delete content.audioPlayOnce;
  } else {
    const part = content.parts.find((p) => p.id === partId);
    if (!part) return NextResponse.json({ error: 'That part is not in this paper.' }, { status: 404 });
    delete part.audioUrl;
  }

  await tests.update(params.id, { content: JSON.stringify(content) });
  return NextResponse.json({ ok: true });
}
