import { requireStaff } from '@/lib/context';
import { attempts, memberships } from '@/lib/db';
import { QuestionResult } from '@/lib/grading';
import ReportsView from '@/components/admin/ReportsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const { org } = await requireStaff();
  /*
   * Everything that has been sat, in one query, without the papers. A paper
   * only appears here if somebody sat it, so the aggregates are built by
   * walking the attempts and grouping as we go rather than by loading every
   * paper in the organisation and filtering the attempts once per paper.
   */
  const rows = await attempts.finished(org.id);
  const cohortOf = new Map((await memberships.listOrg(org.id)).map((m) => [m.id, m.cohort ?? 'Unassigned']));

  interface PaperTally {
    id: string; title: string; module: string; possible: number;
    scores: number[]; wrong: Map<number, number>;
  }
  const tallies = new Map<string, PaperTally>();
  for (const a of rows) {
    const tally = tallies.get(a.testId) ?? {
      id: a.testId,
      title: a.testTitle,
      module: a.testModule,
      // The paper's own question count stands in for its total marks, which is
      // what it is whenever the paper does not print marks per question.
      possible: a.testQuestionCount ?? 0,
      scores: [],
      wrong: new Map<number, number>(),
    };
    tally.scores.push((a.rawScore ?? 0) + (a.manualScore ?? 0));
    const report: QuestionResult[] = a.report ? JSON.parse(a.report) : [];
    for (const r of report) {
      if (!r.manual && !r.correct) tally.wrong.set(r.number, (tally.wrong.get(r.number) ?? 0) + 1);
    }
    tallies.set(a.testId, tally);
  }

  const papers = [...tallies.values()].map((t) => ({
    id: t.id,
    title: t.title,
    module: t.module,
    possible: t.possible,
    attempts: t.scores.length,
    mean: t.scores.length
      ? Math.round((t.scores.reduce((x, y) => x + y, 0) / t.scores.length) * 10) / 10
      : 0,
    scores: t.scores,
    hardest: [...t.wrong.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([number, missed]) => ({
        number, missed, rate: t.scores.length ? Math.round((missed / t.scores.length) * 100) : 0,
      })),
  }));

  const candidates = rows.map((a) => ({
    name: a.candidateRef ?? a.candidateName,
    email: a.candidateEmail,
    cohort: cohortOf.get(a.userId) ?? '',
    paper: a.testTitle,
    sitting: a.sessionName ?? '',
    score: (a.rawScore ?? 0) + (a.manualScore ?? 0),
    band: a.band,
    submittedAt: a.submittedAt,
  }));

  return <ReportsView papers={papers} candidates={candidates} orgName={org.name} />;
}
