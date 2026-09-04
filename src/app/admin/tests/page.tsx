import { requireStaff } from '@/lib/context';
import { tests } from '@/lib/db';
import NewTestButton from '@/components/admin/NewTestButton';
import PapersManager, { PaperRow } from '@/components/admin/PapersManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Papers' };

export default async function TestsPage() {
  const { org, user } = await requireStaff();

  /*
   * One query for the whole screen: the papers' metadata and how many attempts
   * each has, together, and never a paper's own content. A bank of three
   * hundred papers used to mean three hundred and one queries and megabytes of
   * JSON nobody rendered.
   */
  const rows: PaperRow[] = (await tests.listOrgWithCounts(org.id)).map((t) => ({
    id: t.id,
    title: t.title,
    module: t.module,
    status: t.status,
    visibility: t.visibility,
    priceCredits: t.priceCredits,
    durationMin: t.durationMin,
    questionCount: t.questionCount,
    hasAudio: t.hasAudio,
    bank: t.bank,
    folder: t.folder,
    updatedAt: t.updatedAt,
    attemptCount: Number(t.attemptCount) || 0,
  }));

  return (
    <>
      <div className="px-[34px] pt-[34px] max-w-[1320px] flex justify-end">
        <NewTestButton />
      </div>
      <PapersManager
        rows={rows}
        canDelete={user.role === 'owner' || user.role === 'admin' || !!user.isPlatformAdmin}
      />
    </>
  );
}
