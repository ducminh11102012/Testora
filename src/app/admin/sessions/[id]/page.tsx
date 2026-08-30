import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { attempts, events, sittings } from '@/lib/db';
import { Pill, Stat } from '@/components/ui/Shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sitting' };

export default async function SessionMonitor({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const sitting = sittings.byId(params.id);
  if (!sitting || (sitting.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  const rows = attempts.listSession(sitting.id);
  const now = Date.now();

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <Link href="/admin/sessions" className="text-[15px] underline">← All sittings</Link>
      <h1 className="text-[32px] font-semibold mt-[10px] mb-[6px]">{sitting.name}</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[26px]">
        {sitting.testTitle} · code <span className="font-mono tracking-[0.12em] text-[19px]">{sitting.accessCode}</span>
      </p>

      <div className="grid gap-[12px] sm:grid-cols-4 mb-[30px]">
        <Stat label="Started" value={rows.length} />
        <Stat label="In progress" value={rows.filter((a) => a.status === 'in_progress' && new Date(a.endsAt).getTime() > now).length} />
        <Stat label="Submitted" value={rows.filter((a) => a.status !== 'in_progress').length} />
        <Stat label="Flagged events" value={rows.reduce((s, a) => s + events.list(a.id).length, 0)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-[18px] text-[#5e5e5e]">Nobody has started yet. Give candidates the code above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[#dcdcdc]">
                <th className="py-[10px] font-semibold">Candidate</th>
                <th className="py-[10px] font-semibold w-[150px]">Status</th>
                <th className="py-[10px] font-semibold w-[120px]">Score</th>
                <th className="py-[10px] font-semibold w-[160px]">Started</th>
                <th className="py-[10px] font-semibold w-[240px]">Invigilation</th>
                <th className="py-[10px] w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const counts = events.countByType(a.id);
                return (
                  <tr key={a.id} className="border-b border-[#f2f2f2]">
                    <td className="py-[12px]">{a.candidateRef ?? a.candidateName}</td>
                    <td className="py-[12px]">
                      {a.status === 'in_progress'
                        ? <Pill tone="warn">In progress</Pill>
                        : a.status === 'marked' ? <Pill tone="good">Marked</Pill> : <Pill>Submitted</Pill>}
                    </td>
                    <td className="py-[12px] tabular-nums">
                      {a.rawScore === null ? '—' : a.rawScore + (a.manualScore ?? 0)}
                    </td>
                    <td className="py-[12px] text-[#5e5e5e]">{new Date(a.startedAt).toLocaleTimeString()}</td>
                    <td className="py-[12px] text-[14px]">
                      {counts.length === 0
                        ? <span className="text-[#8a8a8a]">clean</span>
                        : counts.map((c) => `${c.type.replace(/-/g, ' ')} ×${c.n}`).join(', ')}
                    </td>
                    <td className="py-[12px] text-right">
                      {a.status !== 'in_progress' && <Link href={`/results/${a.id}`} className="underline">View</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
