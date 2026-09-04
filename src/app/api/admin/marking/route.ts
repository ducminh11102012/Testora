import { NextRequest, NextResponse } from 'next/server';
import { attempts, markings } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { ExamContent, allQuestions } from '@/types/exam';
import { QuestionResult } from '@/lib/grading';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Saves one marker's decision on one writing task and re-totals the attempt. */
export async function POST(req: NextRequest) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  const { attemptId, questionId, scores, comment, awarded, rubricId } = await req.json().catch(() => ({}));
  const attempt = await attempts.byId(String(attemptId ?? ''));
  if (!attempt || !await sameOrg(ctx, attempt.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await markings.save({
    attemptId: attempt.id,
    questionId: String(questionId),
    markerId: ctx.user.id,
    rubricId: rubricId || null,
    scores: JSON.stringify(scores ?? {}),
    comment: String(comment ?? ''),
    awarded: Number(awarded) || 0,
  });

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const essayIds = new Set(
    content.parts.flatMap((p) => p.groups)
      .filter((g) => g.type === 'writing-task')
      .flatMap((g) => g.questions.map((q) => q.id)),
  );
  const saved = await markings.forAttempt(attempt.id);
  const manualTotal = saved.reduce((sum, m) => sum + m.awarded, 0);
  const complete = [...essayIds].every((qid) => saved.some((m) => m.questionId === qid));

  // Fold the human marks into the stored report so one table serves both.
  const report: QuestionResult[] = attempt.report ? JSON.parse(attempt.report) : [];
  const byQuestion = new Map(allQuestions(content).map((q) => [q.id, q]));
  for (const row of report) {
    const mark = saved.find((m) => m.questionId === row.questionId);
    if (!mark) continue;
    row.awarded = mark.awarded;
    row.correct = mark.awarded >= (byQuestion.get(row.questionId)?.points ?? 1) * 0.5;
  }

  await attempts.update(attempt.id, {
    manualScore: manualTotal,
    report: JSON.stringify(report),
    status: complete ? 'marked' : 'marking',
  });

  return NextResponse.json({ ok: true, manualScore: manualTotal, complete });
}
