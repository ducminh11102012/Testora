import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { attempts, rubrics, suiteResults, suites, users } from '@/lib/db';
import { suiteProgress } from '@/lib/suite';
import { RubricCriterion } from '@/types/db';
import SuiteRoster from '@/components/admin/SuiteRoster';
import { SKILL_LABEL } from '@/lib/band-descriptors';
import { Pill } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Full test' };

export default async function SuiteDetail({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const suite = await suites.byId(params.id);
  if (!suite || (suite.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  const items = suites.itemsOf(suite);
  const orgRubric = (await rubrics.listOrg(suite.orgId))[0];
  const criteria: RubricCriterion[] = orgRubric ? JSON.parse(orgRubric.criteria) : [];

  // Everyone who has started any section, plus anyone with a band already entered.
  const started = await attempts.suiteRoster(suite.id);
  const withBands = await suiteResults.listSuite(suite.id);
  const candidateIds = Array.from(new Set([...started.map((a) => a.userId), ...withBands.map((r) => r.userId)]));

  /*
   * The roster is built from what has already been read. Asking per candidate —
   * one account query, then a progress calculation that re-read that
   * candidate's attempts and every section's paper — turned a class of four
   * hundred into thousands of queries for a table of bands.
   */
  const people = new Map((await users.byIds(candidateIds)).map((row) => [row.id, row]));
  const attemptsByUser = new Map<string, typeof started>();
  for (const attempt of started) {
    attemptsByUser.set(attempt.userId, [...(attemptsByUser.get(attempt.userId) ?? []), attempt]);
  }

  const roster = await Promise.all(candidateIds.map(async (userId) => {
    const person = people.get(userId);
    const progress = await suiteProgress(suite, userId, criteria, attemptsByUser.get(userId) ?? []);
    return {
      userId,
      name: person?.candidateRef ?? person?.displayName ?? 'Unknown',
      email: person?.email ?? '',
      bands: Object.fromEntries(progress.skills.map((s) => [s.skill, s.band])) as Record<string, number | null>,
      offlineSkills: progress.skills.filter((s) => s.manual).map((s) => s.skill),
      complete: progress.complete,
      overall: progress.overall,
      released: progress.released,
    };
  }));

  return (
    <div className="px-[34px] py-[34px] max-w-[1200px]">
      <Link href="/admin/suites" className="text-[15px] underline">← All full tests</Link>
      <h1 className="text-[32px] font-semibold mt-[10px] mb-[6px]">{suite.title}</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[8px]">
        {items.map((i) => `${SKILL_LABEL[i.skill]}${i.mode === 'offline' ? ' (examiner)' : ` · ${i.durationMin} min`}`).join('  ·  ')}
      </p>
      <div className="flex gap-[10px] mb-[28px]">
        <Pill tone={suite.status === 'published' ? 'good' : 'neutral'}>{suite.status}</Pill>
        {suite.visibility === 'catalog' && (
          <Pill tone="brand">{suite.priceCredits === 0 ? 'Free in catalogue' : `${suite.priceCredits} credits`}</Pill>
        )}
      </div>

      <SuiteRoster
        suiteId={suite.id}
        roster={roster}
        skills={items.map((i) => i.skill)}
        offlineSkills={items.filter((i) => i.mode === 'offline').map((i) => i.skill)}
      />
    </div>
  );
}
