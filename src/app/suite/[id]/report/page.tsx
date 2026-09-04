import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isStaff, readSession } from '@/lib/auth';
import { brandingOf, memberships, orgs, rubrics, settingsOf, suites, users } from '@/lib/db';
import { suiteProgress } from '@/lib/suite';
import { SKILL_LABEL } from '@/lib/band-descriptors';
import { ExamContent, marksAvailable } from '@/types/exam';
import { RubricCriterion } from '@/types/db';
import BrandScope from '@/components/BrandScope';
import BrandMark from '@/components/ui/BrandMark';
import ScoreReport, { ReportSkill } from '@/components/exam/ScoreReport';
import PointsReport from '@/components/exam/PointsReport';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Test report' };

export default async function SuiteReport({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { candidate?: string };
}) {
  const viewer = await readSession();
  if (!viewer) redirect('/login?reason=auth');

  const suite = await suites.byId(params.id);
  if (!suite) notFound();

  // Staff may open any candidate's report in their own organisation.
  const staffViewing = searchParams.candidate
    && (viewer.isPlatformAdmin || (isStaff(viewer.role) && viewer.orgId === suite.orgId));
  const subjectId = staffViewing ? String(searchParams.candidate) : viewer.id;
  const subject = await users.byId(subjectId);
  if (!subject) notFound();

  if (!staffViewing && !await memberships.find(viewer.id, suite.orgId)
    && !(suite.visibility === 'catalog' && suite.status === 'published')) {
    redirect('/dashboard');
  }

  const org = await orgs.byId(suite.orgId);
  const branding = brandingOf(org);
  const orgRubric = (await rubrics.listOrg(suite.orgId))[0];
  const criteria: RubricCriterion[] = orgRubric ? JSON.parse(orgRubric.criteria) : [];
  const progress = await suiteProgress(suite, subject.id, criteria);

  // Free candidates and the platform's own learners see their report at once;
  // a centre can hold results until it has released them.
  const holdsResults = org?.kind === 'tenant' && !settingsOf(org).allowSelfSignup;
  const visible = staffViewing || progress.released || !holdsResults;

  const skills: ReportSkill[] = progress.skills.map((s) => ({
    skill: s.skill,
    band: s.band,
    attemptId: s.attempt?.id ?? null,
  }));

  const lastSubmitted = progress.skills
    .map((s) => s.attempt?.submittedAt).filter(Boolean).sort().slice(-1)[0] ?? null;

  return (
    <BrandScope branding={branding}>
      <div className="min-h-screen" style={{ background: '#EAF1F8' }}>
        <header className="flex items-center justify-between px-[24px] h-[64px] bg-white border-b border-[#e4e4e4]">
          <BrandMark branding={branding} size="sm" />
          <Link href={staffViewing ? '/admin/attempts' : '/dashboard'} className="text-[15px] underline">Back</Link>
        </header>

        {!progress.complete ? (
          <div className="max-w-[720px] mx-auto px-[24px] py-[48px]">
            <h1 className="text-[28px] font-semibold mb-[10px]">{suite.title}</h1>
            <p className="text-[18px] text-[#3d3d3d] mb-[24px]">
              Your report appears once every section has been completed.
            </p>
            <Link href={`/suite/${suite.id}`} className="text-[16px] underline">Back to the test</Link>
          </div>
        ) : !visible ? (
          <div className="max-w-[720px] mx-auto px-[24px] py-[48px]">
            <h1 className="text-[28px] font-semibold mb-[10px]">{suite.title}</h1>
            <p className="text-[18px] text-[#3d3d3d]">
              Your answers have been submitted. {org?.name} will release your report once marking is complete.
            </p>
          </div>
        ) : progress.scoring === 'points' && progress.points ? (
          /* A full test built from a Vietnamese paper reports marks, not bands. */
          <PointsReport
            title={suite.title}
            candidate={subject.candidateRef ?? subject.displayName}
            sections={progress.skills
              .filter((s) => s.attempt)
              .map((s) => ({
                label: s.testTitle ?? SKILL_LABEL[s.skill],
                awarded: Math.round(((s.attempt!.rawScore ?? 0) + (s.attempt!.manualScore ?? 0)) * 100) / 100,
                available: marksAvailable(JSON.parse(s.attempt!.testContent) as ExamContent),
              }))
              .filter((s) => s.available > 0)}
            awarded={progress.points.awarded}
            available={progress.points.available}
            total={progress.points.total}
            sittingDate={lastSubmitted}
            backHref={staffViewing ? '/admin/attempts' : '/dashboard'}
          />
        ) : (
          <ScoreReport
            title={suite.title}
            candidate={subject.candidateRef ?? subject.displayName}
            skills={skills}
            overall={progress.overall}
            sittingDate={lastSubmitted}
            backHref={staffViewing ? '/admin/attempts' : '/dashboard'}
          />
        )}
      </div>
    </BrandScope>
  );
}
