import { NextRequest, NextResponse } from 'next/server';
import { imports, memberships, orgs, settingsOf } from '@/lib/db';
import { readSession } from '@/lib/auth';
import { startCompose } from '@/lib/import-runner';
import { isConfigured, loadAiConfig } from '@/lib/ai/config';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "No paper? Let the AI write you one." The candidate's own request, so it is
 * fenced in: the centre has to allow it, it counts against a daily allowance,
 * and what comes out belongs to that candidate rather than to the paper list.
 */
export async function POST(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const mine = await memberships.of(user.id);
  const platform = await orgs.platform();
  const orgIds = [...mine.map((m) => m.orgId), ...(platform ? [platform.id] : [])]
    .filter((orgId, i, list) => list.indexOf(orgId) === i);

  let host: { id: string; perDay: number } | null = null;
  for (const orgId of orgIds) {
    const org = await orgs.byId(orgId);
    if (!org) continue;
    const settings = settingsOf(org);
    if (settings.allowCandidateCompose) {
      host = { id: org.id, perDay: Math.max(1, settings.candidateComposePerDay || 1) };
      break;
    }
  }
  if (!host) {
    return NextResponse.json({
      error: 'Your centre has not opened AI-written papers to candidates. Ask them, or pick a paper from the catalogue.',
    }, { status: 403 });
  }

  const config = await loadAiConfig('parse');
  if (!isConfigured(config)) {
    return NextResponse.json({ error: 'No AI provider is configured on this platform yet.' }, { status: 409 });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const used = await imports.countForUser(user.id, today.toISOString());
  if (used >= host.perDay) {
    return NextResponse.json({
      error: `You have asked for ${used} paper(s) today, which is your allowance. Sit one of them, or come back tomorrow.`,
    }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const instructions = String(body.instructions ?? '').trim();
  if (instructions.length < 10) {
    return NextResponse.json({
      error: 'Tell the examiner what you want to practise — the subject, the level, and the kind of questions.',
    }, { status: 400 });
  }

  const record = await imports.create({
    orgId: host.id,
    userId: user.id,
    filename: 'Paper written to order',
    mimeType: 'text/plain',
    sizeBytes: instructions.length,
    strategy: 'ai',
    kind: 'generate',
    instructions,
  });

  startCompose(record, {
    orgId: host.id,
    userId: user.id,
    instructions,
    sample: body.sample ? String(body.sample).slice(0, 20_000) : undefined,
    module: ['reading', 'writing'].includes(String(body.module))
      ? (String(body.module) as 'reading' | 'writing')
      : 'reading',
    questions: Math.min(60, Number(body.questions) || 0) || undefined,
    minutes: Math.min(240, Number(body.minutes) || 0) || undefined,
    paperTitle: String(body.title ?? '').trim() || 'Your paper',
    forUserId: user.id,
    publish: true,
    bank: false,
    writeMissingAnswers: true,
  });

  return NextResponse.json({
    id: record.id,
    status: 'queued',
    remaining: Math.max(0, host.perDay - used - 1),
    message: 'Your paper is being written. It appears on your dashboard in a minute or two — you can leave this page.',
  }, { status: 202 });
}

/** How a candidate's request is getting on, for the panel that polls it. */
export async function GET(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  const rows = await imports.listForUser(user.id, 5);
  const row = id ? rows.find((r) => r.id === id) : rows[0];
  if (!row) return NextResponse.json({ jobs: [] });
  return NextResponse.json({
    job: {
      id: row.id,
      status: row.status,
      error: row.error,
      testIds: JSON.parse(row.testIds || '[]'),
    },
  });
}
