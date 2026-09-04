import { requireStaff } from '@/lib/context';
import { suiteSettingsOf, suites, tests } from '@/lib/db';
import { bankSummary } from '@/lib/assemble';
import SuiteManager from '@/components/admin/SuiteManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Full tests' };

export default async function SuitesPage() {
  const { org } = await requireStaff();
  const rows = (await suites.listOrg(org.id)).map((s) => ({
    id: s.id, title: s.title, status: s.status, visibility: s.visibility,
    priceCredits: s.priceCredits, items: suites.itemsOf(s), settings: suiteSettingsOf(s),
    folder: s.folder,
  }));
  const papers = (await tests.listOrg(org.id)).map((t) => ({ id: t.id, title: t.title, module: t.module, durationMin: t.durationMin }));
  return <SuiteManager suites={rows} papers={papers} bank={await bankSummary(org.id)} />;
}
