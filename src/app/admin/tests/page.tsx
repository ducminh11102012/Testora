import Link from 'next/link';
import { requireStaff } from '@/lib/context';
import { tests } from '@/lib/db';
import { Pill } from '@/components/ui/Shell';
import NewTestButton from '@/components/admin/NewTestButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Papers' };

export default async function TestsPage() {
  const { org } = await requireStaff();
  const rows = tests.listOrg(org.id).map((t) => ({ ...t, attemptCount: tests.attemptCount(t.id) }));

  return (
    <div className="px-[34px] py-[34px] max-w-[1280px]">
      <div className="flex items-center justify-between mb-[26px]">
        <h1 className="text-[32px] font-semibold">Papers</h1>
        <NewTestButton />
      </div>

      {rows.length === 0 ? (
        <p className="text-[18px] text-[#5e5e5e]">
          No papers yet. <Link href="/admin/import" className="underline">Import one</Link> or create a blank paper.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[17px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[#dcdcdc]">
                <th className="py-[10px] font-semibold">Title</th>
                <th className="py-[10px] font-semibold w-[110px]">Module</th>
                <th className="py-[10px] font-semibold w-[130px]">Status</th>
                <th className="py-[10px] font-semibold w-[150px]">Catalogue</th>
                <th className="py-[10px] font-semibold w-[90px]">Minutes</th>
                <th className="py-[10px] font-semibold w-[100px]">Attempts</th>
                <th className="py-[10px] font-semibold w-[180px]">Updated</th>
                <th className="py-[10px] w-[90px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-[#efefef]">
                  <td className="py-[12px]">
                    <Link href={`/admin/tests/${t.id}`} className="underline">{t.title}</Link>
                  </td>
                  <td className="py-[12px] capitalize">{t.module}</td>
                  <td className="py-[12px]">
                    <Pill tone={t.status === 'published' ? 'good' : 'neutral'}>{t.status}</Pill>
                  </td>
                  <td className="py-[12px]">
                    {t.visibility === 'catalog'
                      ? <Pill tone="brand">{t.priceCredits === 0 ? 'Free' : `${t.priceCredits} credits`}</Pill>
                      : <span className="text-[#8a8a8a]">Private</span>}
                  </td>
                  <td className="py-[12px] tabular-nums">{t.durationMin}</td>
                  <td className="py-[12px] tabular-nums">{t.attemptCount}</td>
                  <td className="py-[12px] text-[#5e5e5e]">{new Date(t.updatedAt).toLocaleString()}</td>
                  <td className="py-[12px] text-right">
                    <Link href={`/admin/preview/${t.id}`} className="underline">Preview</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
