import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isStaff, readSession } from '@/lib/auth';
import { attempts, brandingOf, markings, orgs, rubrics, settingsOf, sittings, suiteResults } from '@/lib/db';
import {
  ExamContent, FAMILY_OF, allQuestions, marksAvailable, reportedTotal, scoringOf,
} from '@/types/exam';
import { QuestionResult } from '@/lib/grading';
import { sanitizeInline } from '@/lib/sanitize';
import { writingBand } from '@/lib/suite';
import { RubricCriterion } from '@/types/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill, Stat } from '@/components/ui/Shell';
import ScoreReport from '@/components/exam/ScoreReport';
import PointsReport, { PointsSection } from '@/components/exam/PointsReport';
import { SkillName } from '@/lib/db';

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

  const attempt = await attempts.byId(params.id);
  if (!attempt) redirect('/dashboard');

  const isOwner = attempt.userId === user.id;
  const canSee = isOwner || user.isPlatformAdmin || (isStaff(user.role) && user.orgId === attempt.orgId);
  if (!canSee) redirect('/dashboard');

  const content = JSON.parse(attempt.testContent) as ExamContent;
  const branding = brandingOf(await orgs.byId(attempt.orgId));
  const report: QuestionResult[] = attempt.report ? JSON.parse(attempt.report) : [];
  const questions = new Map(allQuestions(content).map((q) => [q.id, q]));
  const essays = new Set(
    content.parts.flatMap((p) => p.groups).filter((g) => FAMILY_OF[g.type] === 'essay')
      .flatMap((g) => g.questions.map((q) => q.id)),
  );
  const marks = await markings.forAttempt(attempt.id);

  // A writing paper has no raw-score table: its band is the mean of the
  // criteria the marker (or the model) awarded, so it is derived here rather
  // than stored at submission.
  const orgRubric = (await rubrics.listOrg(attempt.orgId))[0];
  const criteria: RubricCriterion[] = orgRubric ? JSON.parse(orgRubric.criteria) : [];
  const band = content.module === 'writing'
    ? await writingBand(attempt, content, criteria)
    : attempt.band;

  // Two separate questions, and staff always see everything: may the candidate
  // see a score at all, and may they see which answers were right?
  const sitting = attempt.sessionId ? await sittings.byId(attempt.sessionId) : null;
  const sittingSettings: Record<string, unknown> = sitting ? JSON.parse(sitting.settings) : {};
  const orgSettings = settingsOf(await orgs.byId(attempt.orgId));
  const release = (sittingSettings.releaseResultsImmediately as boolean | undefined)
    ?? orgSettings.showScore ?? true;
  const answersAllowed = (sittingSettings.showAnswers as boolean | undefined)
    ?? orgSettings.showAnswers ?? true;
  // A withheld score stays withheld however the paper was marked; for a
  // multi-skill test, releasing the candidate's suite result releases it too.
  const suiteReleased = attempt.suiteId
    ? !!(await suiteResults.find(attempt.suiteId, attempt.userId))?.releasedAt
    : false;
  /*
   * Practice is the candidate's own rehearsal: it is kept out of the test
   * report, so there is no sitting to release it and no invigilator waiting to.
   * Withholding it would leave the candidate with nothing to show for the run,
   * which is exactly the hole this page was falling into.
   */
  const practice = attempt.mode === 'practice';
  const withhold = isOwner && !practice && !release && !suiteReleased;
  const showAnswers = !isOwner || answersAllowed;

  const objectivePossible = report.filter((r) => !r.manual).reduce((s, r) => s + r.possible, 0);
  const possible = report.reduce((s, r) => s + r.possible, 0);
  const total = (attempt.rawScore ?? 0) + (attempt.manualScore ?? 0);

  /*
   * Not every paper is IELTS. A provincial gifted-student paper or a
   * specialised-school entrance paper is marked in points out of the total
   * printed on it, so it gets a mark sheet rather than a band form.
   */
  const scheme = scoringOf(content);
  const available = marksAvailable(content) || possible;
  const paperTotal = reportedTotal(content) || possible;

  // Marks by section, in the paper's own order.
  const byQuestion = new Map(report.map((r) => [r.questionId, r]));
  const markByQuestion = new Map(marks.map((m) => [m.questionId, m]));
  const sections: PointsSection[] = content.parts.map((part) => {
    const partQuestions = part.groups.flatMap((g) => g.questions);
    let awarded = 0;
    let sectionAvailable = 0;
    let pendingHere = 0;
    for (const q of partQuestions) {
      const row = byQuestion.get(q.id);
      sectionAvailable += row?.possible ?? q.points ?? 1;
      const mark = markByQuestion.get(q.id);
      if (mark) awarded += mark.awarded;
      else if (row?.correct) awarded += row.awarded ?? row.possible;
      else if (row?.manual) pendingHere += 1;
    }
    return {
      label: part.section ? `${part.section} · ${part.title}` : part.title,
      awarded: Math.round(awarded * 100) / 100,
      available: Math.round(sectionAvailable * 100) / 100,
      pending: pendingHere || undefined,
    };
  }).filter((s) => s.available > 0);

  const pending = report.filter((r) => r.manual && !markByQuestion.has(r.questionId)).length;

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
        {practice && (
          <p className="mb-[14px]">
            <Pill tone="warn">Practice run</Pill>{' '}
            <span className="text-[16px] text-[color:var(--paper-ink-3)]">
              Sat on its own, as often as you like. It is not part of your test report.
              {attempt.suiteId ? ' ' : ''}
            </span>
            {attempt.suiteId && (
              <Link href={`/suite/${attempt.suiteId}`} className="underline text-[16px]">
                Back to the test
              </Link>
            )}
          </p>
        )}
        <p className="text-[18px] text-[color:var(--paper-ink-3)] mb-[30px]">
          {attempt.candidateName}
          {attempt.sessionName ? ` · ${attempt.sessionName}` : ''} · submitted{' '}
          {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '—'}
        </p>

        {!withhold && scheme === 'band' && band !== null && content.module !== 'mixed' && (
          <div className="mb-[40px] -mx-[28px] px-[4px] py-[10px] rounded-[8px]" style={{ background: '#EAF1F8' }}>
            <ScoreReport
              title={attempt.testTitle}
              candidate={attempt.candidateRef ?? attempt.candidateName}
              skills={[{ skill: content.module as SkillName, band, attemptId: null }]}
              overall={band}
              sittingDate={attempt.submittedAt}
              backHref={isOwner ? '/dashboard' : '/admin/attempts'}
              showExplanations
            />
          </div>
        )}

        {!withhold && scheme === 'points' && (
          <div className="mb-[40px] -mx-[28px] px-[4px] py-[10px] rounded-[8px]" style={{ background: '#EAF1F8' }}>
            <PointsReport
              title={attempt.testTitle}
              candidate={attempt.candidateRef ?? attempt.candidateName}
              sections={sections}
              awarded={total}
              available={available}
              total={paperTotal}
              pending={pending}
              sittingDate={attempt.submittedAt}
              backHref={isOwner ? '/dashboard' : '/admin/attempts'}
            />
          </div>
        )}

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
              {scheme === 'band' ? (
                <Stat
                  label="Band"
                  value={band ?? '—'}
                  hint={content.module === 'mixed' ? 'Points only for mixed papers' : undefined}
                />
              ) : (
                <Stat
                  label="On the paper's scale"
                  value={`${available > 0 ? Math.round((total / available) * paperTotal * 10) / 10 : 0} / ${paperTotal}`}
                  hint="Marked in points, not bands"
                />
              )}
            </div>

            {showAnswers ? (
              <>
            <h2 className="text-[24px] font-semibold mb-[14px]">Answer review</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[17px] border-collapse">
                <thead>
                  <tr className="text-left border-b border-[color:var(--line)]">
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
                      <tr key={r.questionId} className="border-b border-[color:var(--line)] align-top">
                        <td className="py-[10px] font-semibold tabular-nums">{r.number}</td>
                        <td className="py-[10px] max-w-[420px]">
                          {essay
                            ? <span className="text-[color:var(--paper-ink-2)] whitespace-pre-wrap">
                                {asText(r.given).slice(0, 400) || 'No response'}
                              </span>
                            : asText(r.given) || <span className="text-[color:var(--bad)]">No answer</span>}
                          {mark?.comment && <p className="mt-[6px] text-[15px] text-[color:var(--paper-ink-3)] italic">{mark.comment}</p>}
                          {/*
                            * Why the answer is the answer. Written when the
                            * paper was imported, and the reason a wrong answer
                            * teaches something instead of just costing a mark.
                            * Sanitised because it came from a model.
                            */}
                          {q?.explanation && (
                            <p className="mt-[8px] text-[15px] leading-[1.6] text-[color:var(--paper-ink-2)] pl-[12px]"
                               style={{ borderLeft: '3px solid var(--line-strong)' }}
                               dangerouslySetInnerHTML={{ __html: sanitizeInline(q.explanation) }} />
                          )}
                        </td>
                        <td className="py-[10px] text-[color:var(--paper-ink-2)]">
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
            ) : (
              <div className="insp-notice">
                Your score is above. This sitting does not show which answers were right — ask your
                teacher if you want to go through the paper.
              </div>
            )}
          </>
        )}
      </main>
    </BrandScope>
  );
}
