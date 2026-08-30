import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isStaff, readSession } from '@/lib/auth';
import { attempts, brandingOf, markings, orgs, sittings } from '@/lib/db';
import { ExamContent, FAMILY_OF, allQuestions } from '@/types/exam';
import { QuestionResult } from '@/lib/grading';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill, Stat } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Result' };

const asText = (v: unknown): string =>
  typeof v === 'string' ? v
    : Array.isArray(v) ? v.join(', ')
      : v && typeof v === 'object'
        ? Object.entries(v as Record<string, string>).map(([k, x]) => `${k}: ${x}`).join(' · ')
        : '';

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const attempt = attempts.byId(params.id);
  if (!attempt) redirect('/dashboard');

  const isOwner = attempt.userId === user.id;
  const canSee = isOwner || user.isPlatformAdmin || (isStaff(user.role) && user.orgId === attempt.orgId);
  if (!canSee) redirect('/dashboard');

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const branding = brandingOf(orgs.byId(attempt.orgId));
  const report: QuestionResult[] = attempt.report ? JSON.parse(attempt.report) : [];
  const questions = new Map(allQuestions(content).map((q) => [q.id, q]));
  const essays = new Set(
    content.parts.flatMap((p) => p.groups).filter((g) => FAMILY_OF[g.type] === 'essay')
      .flatMap((g) => g.questions.map((q) => q.id)),
  );
  const marks = markings.forAttempt(attempt.id);

  // A sitting may hold results back until the centre has finished marking.
  const sitting = attempt.sessionId ? sittings.byId(attempt.sessionId) : null;
  const release = sitting ? (JSON.parse(sitting.settings).releaseResultsImmediately ?? true) : true;
  const withhold = isOwner && !release && attempt.status !== 'marked';

  const objectivePossible = report.filter((r) => !r.manual).reduce((s, r) => s + r.possible, 0);
  const possible = report.reduce((s, r) => s + r.possible, 0);
  const total = (attempt.rawScore ?? 0) + (attempt.manualScore ?? 0);

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Result"
        href={isOwner ? '/dashboard' : '/admin/attempts'}
        right={<Link href={isOwner ? '/dashboard' : '/admin/attempts'} className="hover:underline">Back</Link>}
      />

      <main className="max-w-[1000px] mx-auto px-[28px] py-[44px]">
        <h1 className="text-[34px] font-semibold mb-[6px]">{attempt.testTitle}</h1>
        <p className="text-[18px] text-[#5e5e5e] mb-[30px]">
          {attempt.candidateName}
          {attempt.sessionName ? ` · ${attempt.sessionName}` : ''} · submitted{' '}
          {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '—'}
        </p>

        {withhold ? (
          <div className="border rounded-[6px] px-[22px] py-[18px] text-[18px]"
               style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
            Your answers have been submitted. Your centre will release the result once marking is complete.
          </div>
        ) : (
          <>
            <div className="grid gap-[10px] sm:grid-cols-4 mb-[38px]">
              <Stat label="Total" value={`${total} / ${possible}`} />
              <Stat label="Auto-marked" value={`${attempt.rawScore ?? 0} / ${objectivePossible}`} />
              <Stat label="Marked by examiner" value={attempt.manualScore ?? '—'} />
              <Stat
                label="Band"
                value={attempt.band ?? '—'}
                hint={content.module === 'mixed' ? 'Points only for mixed papers' : undefined}
              />
            </div>

            <h2 className="text-[24px] font-semibold mb-[14px]">Answer review</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[17px] border-collapse">
                <thead>
                  <tr className="text-left border-b border-[#dcdcdc]">
                    <th className="py-[10px] w-[70px] font-semibold">#</th>
                    <th className="py-[10px] font-semibold">Your answer</th>
                    <th className="py-[10px] font-semibold">Accepted</th>
                    <th className="py-[10px] w-[140px] font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => {
                    const q = questions.get(r.questionId);
                    const mark = marks.find((m) => m.questionId === r.questionId);
                    const essay = essays.has(r.questionId);
                    return (
                      <tr key={r.questionId} className="border-b border-[#efefef] align-top">
                        <td className="py-[10px] font-semibold tabular-nums">{r.number}</td>
                        <td className="py-[10px] max-w-[420px]">
                          {essay
                            ? <span className="text-[#3d3d3d] whitespace-pre-wrap">
                                {asText(r.given).slice(0, 400) || 'No response'}
                              </span>
                            : asText(r.given) || <span className="text-[color:var(--bad)]">No answer</span>}
                          {mark?.comment && <p className="mt-[6px] text-[15px] text-[#5e5e5e] italic">{mark.comment}</p>}
                        </td>
                        <td className="py-[10px] text-[#3d3d3d]">
                          {essay ? '—'
                            : q?.fields?.length
                              ? q.fields.map((f) => `${f.label ?? f.key}: ${f.answers.join(' / ')}`).join('  ·  ')
                              : (q?.answers.join(' / ') || '—')}
                        </td>
                        <td className="py-[10px]">
                          {essay
                            ? mark
                              ? <Pill tone="good">{mark.awarded} / {r.possible}</Pill>
                              : <Pill tone="warn">Awaiting marker</Pill>
                            : r.correct ? <Pill tone="good">Correct</Pill> : <Pill tone="bad">Incorrect</Pill>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </BrandScope>
  );
}
