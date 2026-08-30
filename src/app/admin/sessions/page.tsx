import { requireStaff } from '@/lib/context';
import { sittings, tests } from '@/lib/db';
import SessionManager from '@/components/admin/SessionManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sittings' };

export default async function SessionsPage() {
  const { org } = await requireStaff();
  const rows = sittings.listOrg(org.id).map((s) => ({
    id: s.id, name: s.name, code: s.accessCode, testTitle: s.testTitle, status: s.status,
    opensAt: s.opensAt, closesAt: s.closesAt, durationMin: s.durationMin,
    attempts: sittings.attemptCount(s.id), settings: JSON.parse(s.settings),
  }));
  const papers = tests.listOrg(org.id)
    .filter((t) => t.status === 'published')
    .map((t) => ({ id: t.id, title: t.title, durationMin: t.durationMin }));

  return <SessionManager sessions={rows} papers={papers} />;
}
