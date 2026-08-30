import { requireStaff } from '@/lib/context';
import { accessCodes, tests } from '@/lib/db';
import CodeManager from '@/components/admin/CodeManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Access codes' };

export default async function CodesPage() {
  const { org } = await requireStaff();
  return (
    <CodeManager
      codes={accessCodes.list(org.id)}
      papers={tests.listOrg(org.id).map((t) => ({ id: t.id, title: t.title }))}
    />
  );
}
