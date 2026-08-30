import { requireStaff } from '@/lib/context';
import { attempts, memberships, tests } from '@/lib/db';
import { ExamContent, allQuestions } from '@/types/exam';
import { QuestionResult } from '@/lib/grading';
import ReportsView from '@/components/admin/ReportsView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reports' };

export default async function ReportsPage() {
  const { org } = await requireStaff();
  const rows = attempts.listOrg(org.id, 1000).filter((a) => a.status !== 'in_progress');
  const cohortOf = new Map(memberships.listOrg(org.id).map((m) => [m.id, m.cohort ?? 'Unassigned']));

  // Per-paper aggregates: score distribution and the questions most often missed.
  const papers = tests.listOrg(org.id).map((t) => {
    const mine = rows.filter((a) => a.testId === t.id);
    const content = JSON.parse(t.content) as ExamContent;
    const questions = allQuestions(content);
    const possible = questions.reduce((s, q) => s + (q.points ?? 1), 0);

    const wrong = new Map<number, number>();
    for (const a of mine) {
      const report: QuestionResult[] = a.report ? JSON.parse(a.report) : [];
      for (const r of report) if (!r.manual && !r.correct) wrong.set(r.number, (wrong.get(r.number) ?? 0) + 1);
    }

    const scores = mine.map((a) => (a.rawScore ?? 0) + (a.manualScore ?? 0));
    return {
      id: t.id,
      title: t.title,
      module: t.module,
      possible,
      attempts: mine.length,
      mean: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : 0,
      scores,
      hardest: [...wrong.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([number, missed]) => ({ number, missed, rate: mine.length ? Math.round((missed / mine.length) * 100) : 0 })),
    };
  }).filter((p) => p.attempts > 0);

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
