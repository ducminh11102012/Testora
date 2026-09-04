import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/context';
import { attempts, events, sittings } from '@/lib/db';
import { Pill, Stat } from '@/components/ui/Shell';
import SittingControls from '@/components/admin/SittingControls';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sitting' };

export default async function SessionMonitor({ params }: { params: { id: string } }) {
  const { org, user } = await requireStaff();
  const sitting = await sittings.byId(params.id);
  if (!sitting || (sitting.orgId !== org.id && !user.isPlatformAdmin)) notFound();

  // Names, clocks and flags — not the papers themselves, which this screen
  // never shows and which would be a few hundred megabytes in a full room.
  const rows = await attempts.roster(sitting.id);
  const now = Date.now();
  const rules = JSON.parse(sitting.settings || '{}') as Record<string, boolean>;

  /*
   * The whole room's invigilation trail in one grouped query. It used to be two
   * queries per candidate — one of them fetching every event row only to count
   * them — which in a room of three hundred was six hundred round trips.
   */
  const countsByAttempt: Record<string, { type: string; n: number }[]> = {};
  for (const row of await events.countsForSession(sitting.id)) {
    const list = countsByAttempt[row.attemptId] ?? [];
    list.push({ type: row.type, n: Number(row.n) });
    countsByAttempt[row.attemptId] = list;
  }
  const eventCounts = rows.map((a) => (countsByAttempt[a.id] ?? []).reduce((sum, c) => sum + c.n, 0));

  return (
    <div className="px-[34px] py-[34px] max-w-[1240px]">
      <div className="flex items-center justify-between">
        <Link href="/admin/sessions" className="text-[15px] underline">← All sittings</Link>
        <a href={`/api/admin/reports/export?sitting=${sitting.id}`}
           className="text-[15px] underline">Download this sitting's results (CSV)</a>
      </div>
      <h1 className="text-[32px] font-semibold mt-[10px] mb-[6px]">{sitting.name}</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px]">
        {sitting.suiteTitle ?? sitting.testTitle ?? 'Deleted paper'}
        {sitting.suiteId ? ' · full test, sat skill by skill' : ''} · code{' '}
        <span className="font-mono tracking-[0.12em] text-[19px]">{sitting.accessCode}</span>
      </p>

      <SittingControls
        sittingId={sitting.id}
        released={rules.releaseResultsImmediately ?? true}
        showAnswers={rules.showAnswers ?? true}
      />

      <div className="grid gap-[12px] sm:grid-cols-4 mb-[30px]">
        <Stat label="Started" value={rows.length} />
        <Stat label="In progress" value={rows.filter((a) => a.status === 'in_progress' && new Date(a.endsAt).getTime() > now).length} />
        <Stat label="Submitted" value={rows.filter((a) => a.status !== 'in_progress').length} />
        <Stat label="Flagged events" value={eventCounts.reduce((s, n) => s + n, 0)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">Nobody has started yet. Give candidates the code above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[color:var(--line)]">
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
                const counts = countsByAttempt[a.id] ?? [];
                return (
                  <tr key={a.id} className="border-b border-[color:var(--line)]">
                    <td className="py-[12px]">{a.candidateRef ?? a.candidateName}</td>
                    <td className="py-[12px]">
                      {a.status === 'in_progress'
                        ? <Pill tone="warn">In progress</Pill>
                        : a.status === 'marked' ? <Pill tone="good">Marked</Pill> : <Pill>Submitted</Pill>}
                    </td>
                    <td className="py-[12px] tabular-nums">
                      {a.rawScore === null ? '—' : a.rawScore + (a.manualScore ?? 0)}
                    </td>
                    <td className="py-[12px] text-[color:var(--paper-ink-3)]">{new Date(a.startedAt).toLocaleTimeString()}</td>
                    <td className="py-[12px] text-[14px]">
                      {counts.length === 0
                        ? <span className="text-[color:var(--paper-ink-3)]">clean</span>
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
