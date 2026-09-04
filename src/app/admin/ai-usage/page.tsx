import { requireStaff } from '@/lib/context';
import { aiUsage } from '@/lib/db';
import { Stat } from '@/components/ui/Shell';
import UsageTable from '@/components/admin/UsageTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI usage' };

export default async function OrgUsagePage() {
  const { org } = await requireStaff();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  // Narrowed in the database rather than by filtering the platform's history.
  const rows = await aiUsage.summary(monthStart.toISOString(), org.id);
  const totals = await aiUsage.totals(org.id);

  return (
    <div className="px-[34px] py-[34px] max-w-[1100px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">AI usage</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px] max-w-[70ch]">
        What {org.name} has used this month. Importing a paper and marking extended writing are the two
        things that call a model; everything with an answer key is marked without one.
      </p>

      <div className="grid gap-[12px] sm:grid-cols-3 mb-[28px]">
        <Stat label="Calls this month" value={rows.reduce((s, r) => s + r.calls, 0)} />
        <Stat label="Spend this month" value={`${(rows.reduce((s, r) => s + r.costMicros, 0) / 10_000).toFixed(2)}¢`} />
        <Stat label="Calls all time" value={totals?.calls ?? 0} />
      </div>

      <UsageTable rows={rows} showOrg={false} />
    </div>
  );
}
