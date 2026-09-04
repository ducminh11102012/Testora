import { NextRequest, NextResponse } from 'next/server';
import { attempts, markings, rubrics, sittings, suites } from '@/lib/db';
import { readSession } from '@/lib/auth';
import { QuestionResult, grade } from '@/lib/grading';
import { rawToBand, tableFor } from '@/lib/bands';
import { ExamContent, FAMILY_OF, allQuestions, scoringOf } from '@/types/exam';
import { RubricCriterion } from '@/types/db';
import { loadAiConfig } from '@/lib/ai/config';
import { aiJudgingAvailable, aiMarkingAvailable, judgeTransformation, markWriting } from '@/lib/ai/marking';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 300;

/** The same grace the answer autosave allows, so a save in flight still lands. */
const GRACE_MS = 10_000;

const DEFAULT_CRITERIA: RubricCriterion[] = [
  { key: 'task', label: 'Task response', max: 9, descriptors: 'Answers the question fully and develops a position.' },
  { key: 'coherence', label: 'Coherence and cohesion', max: 9, descriptors: 'Logical progression, paragraphing, linking.' },
  { key: 'lexis', label: 'Lexical resource', max: 9, descriptors: 'Range and precision of vocabulary.' },
  { key: 'grammar', label: 'Grammatical range and accuracy', max: 9, descriptors: 'Variety of structures, control of error.' },
];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attempt = await attempts.byId(params.id);
  if (!attempt || attempt.userId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'in_progress') return NextResponse.json({ ok: true, alreadySubmitted: true });

  const body = await req.json().catch(() => ({}));
  // The clock is the server's. Once it has run out — with the same ten-second
  // grace the autosave allows — whatever was last saved is what gets marked, so
  // blocking the browser's saves and posting late buys nothing.
  const expired = Date.now() > new Date(attempt.endsAt).getTime() + GRACE_MS;
  const answers = expired ? JSON.parse(attempt.answers) : (body.answers ?? JSON.parse(attempt.answers));
  const content = JSON.parse(attempt.testContent) as ExamContent;

  const result = grade(content, answers);
  const questions = new Map(allQuestions(content).map((q) => [q.id, q]));
  // Marking has its own provider, which may be a different model from parsing.
  const config = await loadAiConfig('mark');
  const ctx = { orgId: attempt.orgId, userId: user.id } as const;

  /* --- 1. transformations the algorithm could not accept ---------------- */
  // Rewrites have too many valid wordings to enumerate, so anything the model
  // answers list misses is put to the model. Word limits and the compulsory
  // word are still enforced in code.
  let raw = result.raw;
  const judged: string[] = [];

  if (await aiJudgingAvailable(config)) {
    const candidates = result.perQuestion.filter((r) => {
      if (r.correct || r.manual) return false;
      const q = questions.get(r.questionId);
      return !!q?.keyWord && typeof r.given === 'string' && r.given.trim().length > 0;
    });

    const verdicts = await Promise.allSettled(candidates.map(async (r) => {
      const q = questions.get(r.questionId)!;
      const verdict = await judgeTransformation({
        question: q, given: String(r.given), config,
        ctx: { feature: 'transform-judging', ...ctx, meta: { attemptId: attempt.id, number: q.number } },
      });
      return { row: r, verdict, points: q.points ?? 1 };
    }));

    for (const outcome of verdicts) {
      if (outcome.status !== 'fulfilled') continue;
      const { row, verdict, points } = outcome.value;
      if (verdict.correct) { row.correct = true; row.awarded = points; raw += points; }
      row.note = verdict.reason;
      row.markedBy = 'ai';
      judged.push(String(row.number));
    }
  }

  /* --- 2. extended writing ---------------------------------------------- */
  const essayQuestions = content.parts.flatMap((p) => p.groups)
    .filter((g) => FAMILY_OF[g.type] === 'essay')
    .flatMap((g) => g.questions.map((q) => ({ q, instructions: g.instructions ?? '' })));

  let manualScore: number | null = null;
  let markedByAi = 0;

  if (essayQuestions.length && await aiMarkingAvailable(config)) {
    const orgRubric = (await rubrics.listOrg(attempt.orgId))[0];
    const criteria: RubricCriterion[] = orgRubric ? JSON.parse(orgRubric.criteria) : DEFAULT_CRITERIA;

    const marks = await Promise.allSettled(essayQuestions.map(async ({ q, instructions }) => {
      const response = typeof answers[q.id] === 'string' ? (answers[q.id] as string) : '';
      if (!response.trim()) return { q, mark: { scores: {}, comment: 'No response was written.', awarded: 0, strengths: [], improvements: [] } };
      const mark = await markWriting({
        taskInstructions: instructions,
        response,
        criteria,
        points: q.points ?? 1,
        minWords: q.minWords ?? 250,
        paperNotes: content.markingNotes,
        config,
        ctx: { feature: 'writing-marking', ...ctx, meta: { attemptId: attempt.id, number: q.number } },
      });
      return { q, mark };
    }));

    let total = 0;
    for (const outcome of marks) {
      if (outcome.status !== 'fulfilled') continue;
      const { q, mark } = outcome.value;
      await markings.save({
        attemptId: attempt.id,
        questionId: q.id,
        markerId: null,
        rubricId: orgRubric?.id ?? null,
        scores: JSON.stringify(mark.scores),
        comment: mark.comment,
        awarded: mark.awarded,
        source: 'ai',
        feedback: JSON.stringify({ strengths: mark.strengths, improvements: mark.improvements }),
      });
      total += mark.awarded;
      markedByAi += 1;
      const row = result.perQuestion.find((r) => r.questionId === q.id);
      if (row) { row.awarded = mark.awarded; row.markedBy = 'ai'; row.note = mark.comment; }
    }
    if (markedByAi) manualScore = Math.round(total * 10) / 10;
  }

  /* --- 3. store ---------------------------------------------------------- */
  const everyEssayMarked = essayQuestions.length > 0 && markedByAi === essayQuestions.length;
  const needsPerson = result.requiresManualMarking && !everyEssayMarked;

  // Only an IELTS-shaped listening or reading paper converts to a band. A
  // gifted-student or specialised-school paper is marked in points out of its
  // own printed total, and inventing a band for it would mean nothing to the
  // school that set it. A writing paper's band comes from its marks instead.
  const bandable = scoringOf(content) === 'band'
    && (content.module === 'listening' || content.module === 'reading');
  const band = needsPerson || !bandable
    ? null
    : rawToBand(raw, tableFor(content.module, content.variant));

  await attempts.update(attempt.id, {
    status: needsPerson ? 'submitted' : 'marked',
    submittedAt: new Date().toISOString(),
    answers: JSON.stringify(answers),
    ...(!expired && body.annotations ? { annotations: JSON.stringify(body.annotations) } : {}),
    ...(!expired && body.flags ? { flags: JSON.stringify(body.flags) } : {}),
    rawScore: raw,
    manualScore,
    band,
    report: JSON.stringify(result.perQuestion as QuestionResult[]),
  });

  const sitting = attempt.sessionId ? await sittings.byId(attempt.sessionId) : null;
  const release = sitting ? (JSON.parse(sitting.settings).releaseResultsImmediately ?? true) : true;
  const suite = attempt.suiteId ? await suites.byId(attempt.suiteId) : null;

  /*
   * Where the candidate goes next. A section of a real sitting goes back to the
   * hub, because the next section is the obvious next step and the score is the
   * test's to release. A *practice* run is the opposite: it is one section sat
   * alone, it is kept out of the test report on purpose, so the hub has nothing
   * to show for it — sending a candidate there after practice showed them the
   * mode chooser again and no result at all. Practice goes to its own result.
   */
  const practice = attempt.mode === 'practice';

  return NextResponse.json({
    ok: true,
    raw,
    possible: result.possible,
    band,
    awaitingMarking: needsPerson,
    markedByAi,
    judged,
    release,
    practice,
    suiteId: practice ? null : suite?.id ?? null,
  });
}
