import { requireStaff } from '@/lib/context';
import { imports } from '@/lib/db';
import { configuredProvider } from '@/lib/parse';
import ImportWizard from '@/components/admin/ImportWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import a paper' };

export default async function ImportPage() {
  const { org } = await requireStaff();
  const recent = imports.listOrg(org.id, 10);
  return (
    <ImportWizard
      provider={configuredProvider()}
      recent={recent.map((r) => ({
        id: r.id, filename: r.filename, status: r.status, provider: r.provider,
        createdAt: r.createdAt, testId: r.testId,
      }))}
    />
  );
}
