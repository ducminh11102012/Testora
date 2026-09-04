import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { aiUsage, brandingOf, orgs, orgApplications } from '@/lib/db';
import { loadAiConfig } from '@/lib/ai/config';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Stat } from '@/components/ui/Shell';
import PlatformNav from '@/components/PlatformNav';
import LogoutButton from '@/components/LogoutButton';
import UsageTable from '@/components/admin/UsageTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI usage' };

export default async function UsagePage() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const month = await aiUsage.summary(monthStart.toISOString());
  const allTime = await aiUsage.totals();
  const config = await loadAiConfig('parse');
  const monthCents = month.reduce((s, r) => s + r.costMicros, 0) / 10_000;

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/usage" pending={pending} />
        <h1 className="text-[32px] font-semibold mb-[8px]">AI usage</h1>
        <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px] max-w-[70ch]">
          Every model call is recorded against the organisation that caused it — a school importing a
          paper, or a candidate&rsquo;s writing being marked.
        </p>

        <div className="grid gap-[12px] sm:grid-cols-4 mb-[30px]">
          <Stat label="Calls this month" value={month.reduce((s, r) => s + r.calls, 0)} />
          <Stat label="Spend this month" value={`${monthCents.toFixed(2)}¢`} />
          <Stat label="Calls all time" value={allTime?.calls ?? 0} />
          <Stat
            label="Budget"
            value={config.monthlyBudgetCents ? `${config.monthlyBudgetCents}¢` : 'None'}
            hint={config.monthlyBudgetCents
              ? `${Math.round((monthCents / config.monthlyBudgetCents) * 100)}% used`
              : undefined}
          />
        </div>

        <h2 className="text-[22px] font-semibold mb-[14px]">This month, by organisation</h2>
        <UsageTable rows={month} />
      </main>
    </BrandScope>
  );
}
