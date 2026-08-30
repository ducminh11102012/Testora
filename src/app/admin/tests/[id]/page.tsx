import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { tests } from '@/lib/db';
import TestEditor from '@/components/admin/TestEditor';
import { ExamContent } from '@/types/exam';

export const dynamic = 'force-dynamic';

export default async function EditTestPage({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const test = tests.byId(params.id);
  if (!test || (test.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  return (
    <TestEditor
      testId={test.id}
      status={test.status}
      visibility={test.visibility}
      priceCredits={test.priceCredits}
      isPlatformTenant={org.kind === 'platform'}
      initial={JSON.parse(test.content) as ExamContent}
    />
  );
}
