import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { brandingOf, tests } from '@/lib/db';
import ExamShell from '@/components/exam/ExamShell';
import { ExamContent } from '@/types/exam';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preview' };

export default async function PreviewPage({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const test = tests.byId(params.id);
  if (!test || (test.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  const content = JSON.parse(test.content) as ExamContent;
  const now = Date.now();

  return (
    <ExamShell
      previewMode
      content={content}
      branding={brandingOf(org)}
      attempt={{
        id: 'preview',
        testTakerId: 'Preview',
        startedAt: new Date(now).toISOString(),
        endsAt: new Date(now + (content.durationMinutes ?? 60) * 60_000).toISOString(),
        answers: {},
        annotations: [],
        flags: [],
      }}
    />
  );
}
