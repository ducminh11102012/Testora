import { requireStaff } from '@/lib/context';
import { imports } from '@/lib/db';
import { configuredProvider } from '@/lib/parse';
import { importStage, resumeStalled } from '@/lib/import-runner';
import ImportWizard from '@/components/admin/ImportWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Import a paper' };

export default async function ImportPage() {
  const { org } = await requireStaff();
  // Opening this screen also nudges anything a crashed worker left behind.
  void resumeStalled(2);
  const recent = await imports.listOrg(org.id, 15);
  return (
    <ImportWizard
      provider={await configuredProvider()}
      recent={recent.map((r) => ({
        id: r.id,
        filename: r.filename,
        status: r.status,
        stage: importStage(r).label,
        provider: r.provider,
        testId: r.testId,
        error: r.error,
        warnings: JSON.parse(r.warnings || '[]') as string[],
        createdAt: r.createdAt,
      }))}
    />
  );
}
