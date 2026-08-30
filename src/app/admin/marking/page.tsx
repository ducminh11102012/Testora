import Link from 'next/link';
import { requireStaff } from '@/lib/context';
import { attempts } from '@/lib/db';
import { Pill } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marking' };

export default async function MarkingQueue() {
  const { org } = await requireStaff();
  const queue = attempts.awaitingMarking(org.id);

  return (
    <div className="px-[34px] py-[34px] max-w-[1100px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">Marking queue</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[28px] max-w-[70ch]">
        Objective sections are already marked. These papers contain writing tasks that need a person.
      </p>

      {queue.length === 0 ? (
        <p className="text-[18px] text-[#5e5e5e]">Nothing is waiting.</p>
      ) : (
        <table className="w-full text-[16px] border-collapse">
          <thead>
            <tr className="text-left border-b border-[#dcdcdc]">
              <th className="py-[10px] font-semibold">Candidate</th>
              <th className="py-[10px] font-semibold">Paper</th>
              <th className="py-[10px] font-semibold w-[150px]">Submitted</th>
              <th className="py-[10px] font-semibold w-[140px]">Status</th>
              <th className="py-[10px] w-[90px]" />
            </tr>
          </thead>
          <tbody>
            {queue.map((a) => (
              <tr key={a.id} className="border-b border-[#f2f2f2]">
                <td className="py-[12px]">{a.candidateRef ?? a.candidateName}</td>
                <td className="py-[12px]">{a.testTitle}</td>
                <td className="py-[12px] text-[#5e5e5e]">
                  {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}
                </td>
                <td className="py-[12px]">
                  {a.status === 'marking' ? <Pill tone="warn">Part marked</Pill> : <Pill>Not started</Pill>}
                </td>
                <td className="py-[12px] text-right">
                  <Link href={`/admin/marking/${a.id}`} className="underline">Mark</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
