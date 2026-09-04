import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { brandingOf, memberships, orgs, rubrics, suiteSettingsOf, suites } from '@/lib/db';
import { suiteProgress } from '@/lib/suite';
import { RubricCriterion } from '@/types/db';
import BrandScope from '@/components/BrandScope';
import SuiteHub, { HubSkill } from '@/components/exam/SuiteHub';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  const suite = await suites.byId(params.id);
  return { title: suite?.title ?? 'Test' };
}

export default async function SuitePage({ params }: { params: { id: string } }) {
  const user = await readSession();
  if (!user) redirect('/login?reason=auth');

  const suite = await suites.byId(params.id);
  if (!suite) notFound();

  const open = suite.visibility === 'catalog' && suite.status === 'published';
  if (!open && !await memberships.find(user.id, suite.orgId) && !user.isPlatformAdmin) redirect('/dashboard');

  const org = await orgs.byId(suite.orgId);
  const orgRubric = (await rubrics.listOrg(suite.orgId))[0];
  const criteria: RubricCriterion[] = orgRubric ? JSON.parse(orgRubric.criteria) : [];
  const progress = await suiteProgress(suite, user.id, criteria);

  const skills: HubSkill[] = progress.skills.map((s) => ({
    skill: s.skill,
    status: s.status,
    durationMin: s.item.durationMin,
    videoUrl: s.item.videoUrl,
    manual: s.manual,
    attemptId: s.attempt?.id ?? null,
    practiceAttemptId: s.practice?.id ?? null,
    lastPractice: s.practiceDone
      ? {
        id: s.practiceDone.id,
        at: s.practiceDone.submittedAt,
        raw: s.practiceDone.rawScore,
        marked: s.practiceDone.status === 'marked',
      }
      : null,
  }));

  const rules = suiteSettingsOf(suite);

  return (
    <BrandScope branding={brandingOf(org)}>
      <SuiteHub
        suiteId={suite.id}
        title={suite.title}
        description={suite.description}
        candidateRef={user.candidateRef ?? user.displayName}
        branding={brandingOf(org)}
        skills={skills}
        complete={progress.complete}
        released={progress.released}
        allowPractice={rules.allowPractice}
        allowSimulation={rules.allowSimulation}
        practiceMaxMinutes={rules.practiceMaxMinutes}
      />
    </BrandScope>
  );
}
