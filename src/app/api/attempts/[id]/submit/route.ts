import { NextRequest, NextResponse } from 'next/server';
import { attempts, sittings } from '@/lib/db';
import { readSession } from '@/lib/auth';
import { grade } from '@/lib/grading';
import { rawToBand, tableFor } from '@/lib/bands';
import { ExamContent } from '@/types/exam';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attempt = attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ ok: true, alreadySubmitted: true });

  const body = await req.json().catch(() => ({}));
  const answers = body.answers ?? JSON.parse(attempt.answers);
  const content = JSON.parse(attempt.testContent) as ExamContent;

  const result = grade(content, answers);
  // A band is only meaningful for a single-skill paper marked entirely by
  // machine; mixed papers report points, and essays wait for a marker.
  const band = result.requiresManualMarking || content.module === 'mixed'
    ? null
    : rawToBand(result.raw, tableFor(content.module, content.variant));

  attempts.update(attempt.id, {
    status: result.requiresManualMarking ? 'submitted' : 'marked',
    submittedAt: new Date().toISOString(),
    answers: JSON.stringify(answers),
    ...(body.annotations ? { annotations: JSON.stringify(body.annotations) } : {}),
    ...(body.flags ? { flags: JSON.stringify(body.flags) } : {}),
    rawScore: result.raw,
    band,
    report: JSON.stringify(result.perQuestion),
  });

  const sitting = attempt.sessionId ? sittings.byId(attempt.sessionId) : null;
  const release = sitting ? (JSON.parse(sitting.settings).releaseResultsImmediately ?? true) : true;

  return NextResponse.json({
    ok: true,
    raw: result.raw,
    possible: result.possible,
    band,
    awaitingMarking: result.requiresManualMarking,
    release,
  });
}
