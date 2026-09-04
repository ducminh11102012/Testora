import Link from 'next/link';
import { requireStaff } from '@/lib/context';
import { attempts } from '@/lib/db';
import { Pill } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Attempts' };

export default async function AttemptsPage() {
  const { org } = await requireStaff();
  const rows = await attempts.listOrg(org.id, 300);

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <h1 className="text-[32px] font-semibold mb-[26px]">Attempts</h1>
      {rows.length === 0 ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">Nobody has sat a paper yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[color:var(--line)]">
                <th className="py-[10px] font-semibold">Candidate</th>
                <th className="py-[10px] font-semibold">Paper</th>
                <th className="py-[10px] font-semibold w-[150px]">Sitting</th>
                <th className="py-[10px] font-semibold w-[140px]">Status</th>
                <th className="py-[10px] font-semibold w-[90px]">Score</th>
                <th className="py-[10px] font-semibold w-[80px]">Band</th>
                <th className="py-[10px] font-semibold w-[170px]">Started</th>
                <th className="py-[10px] w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-[color:var(--line)]">
                  <td className="py-[11px]">{a.candidateRef ?? a.candidateName}</td>
                  <td className="py-[11px]">{a.testTitle}</td>
                  <td className="py-[11px] text-[color:var(--paper-ink-3)]">{a.sessionName ?? '—'}</td>
                  <td className="py-[11px]">
                    {a.status === 'marked' ? <Pill tone="good">Marked</Pill>
                      : a.status === 'in_progress' ? <Pill tone="warn">In progress</Pill>
                        : <Pill>Awaiting marking</Pill>}
                  </td>
                  <td className="py-[11px] tabular-nums">
                    {a.rawScore === null ? '—' : a.rawScore + (a.manualScore ?? 0)}
                  </td>
                  <td className="py-[11px] tabular-nums font-semibold">{a.band ?? '—'}</td>
                  <td className="py-[11px] text-[color:var(--paper-ink-3)]">{new Date(a.startedAt).toLocaleString()}</td>
                  <td className="py-[11px] text-right">
                    {a.status !== 'in_progress' && <Link href={`/results/${a.id}`} className="underline">View</Link>}
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
