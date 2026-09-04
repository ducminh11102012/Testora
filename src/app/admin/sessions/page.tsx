import { requireStaff } from '@/lib/context';
import { sittings, suites, tests } from '@/lib/db';
import SessionManager from '@/components/admin/SessionManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sittings' };

export default async function SessionsPage() {
  const { org } = await requireStaff();
  // Every sitting's attempt count in one query, rather than one query each.
  const counts = new Map(
    (await sittings.attemptCounts(org.id)).map((row) => [row.sessionId, Number(row.n)]),
  );
  const rows = (await sittings.listOrg(org.id)).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.accessCode,
    // A sitting is for one paper or for a whole full test.
    opens: s.suiteTitle ?? s.testTitle ?? 'Deleted paper',
    isSuite: !!s.suiteId,
    status: s.status,
    opensAt: s.opensAt,
    closesAt: s.closesAt,
    durationMin: s.durationMin,
    attempts: counts.get(s.id) ?? 0,
    settings: JSON.parse(s.settings) as Record<string, boolean | number>,
  }));

  const papers = (await tests.listOrgMeta(org.id))
    .filter((t) => t.status === 'published')
    .map((t) => ({ id: t.id, title: t.title, durationMin: t.durationMin }));

  // Only a published full test can be scheduled, same as a paper.
  const fullTests = (await suites.listOrg(org.id))
    .filter((u) => u.status === 'published')
    .map((u) => ({ id: u.id, title: u.title }));

  return <SessionManager sessions={rows} papers={papers} fullTests={fullTests} />;
}
