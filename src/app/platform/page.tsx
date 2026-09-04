import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { attempts, brandingOf, orders, orgs, tests, users, orgApplications } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader, { Pill, Stat } from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import NewOrgForm from '@/components/admin/NewOrgForm';
import PlatformNav from '@/components/PlatformNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Platform' };

export default async function PlatformAdmin() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const list = await Promise.all((await orgs.list()).map(async (o) => ({
    ...o,
    joinCode: await orgs.ensureJoinCode(o),
    members: await orgs.memberCount(o.id),
    papers: await tests.count(o.id),
    attempts: await attempts.count(o.id),
  })));

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />

      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform" pending={pending} />
        <div className="grid gap-[12px] sm:grid-cols-4 mb-[30px]">
          <Stat label="Organisations" value={list.length} />
          <Stat label="Accounts" value={await users.count()} />
          <Stat label="Papers" value={await tests.count()} />
          <Stat label="Attempts" value={await attempts.count()} />
        </div>

        <h2 className="text-[24px] font-semibold mb-[14px]">Organisations</h2>
        <table className="w-full text-[16px] border-collapse mb-[34px]">
          <thead>
            <tr className="text-left border-b border-[color:var(--line)]">
              <th className="py-[10px] font-semibold">Name</th>
              <th className="py-[10px] font-semibold w-[200px]">Address</th>
              <th className="py-[10px] font-semibold w-[120px]">Kind</th>
              <th className="py-[10px] font-semibold w-[130px]">Join code</th>
              <th className="py-[10px] font-semibold w-[110px]">Members</th>
              <th className="py-[10px] font-semibold w-[100px]">Papers</th>
              <th className="py-[10px] font-semibold w-[110px]">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} className="border-b border-[color:var(--line)]">
                <td className="py-[11px]">{o.name}</td>
                <td className="py-[11px]">
                  <Link href={`/o/${o.slug}`} className="underline">/o/{o.slug}</Link>
                </td>
                <td className="py-[11px]">
                  <Pill tone={o.kind === 'tenant' ? 'neutral' : 'brand'}>{o.kind}</Pill>
                </td>
                <td className="py-[11px]">
                  <code className="tracking-[0.14em]">{o.joinCode ?? '—'}</code>
                </td>
                <td className="py-[11px] tabular-nums">{o.members}</td>
                <td className="py-[11px] tabular-nums">{o.papers}</td>
                <td className="py-[11px] tabular-nums">{o.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <NewOrgForm />

        <h2 className="text-[24px] font-semibold mt-[40px] mb-[14px]">Recent orders</h2>
        {(await orders.listAll(20)).length === 0 ? (
          <p className="text-[17px] text-[color:var(--paper-ink-3)]">
            No orders yet. Credits are currently issued through access codes; a payment provider can be
            attached in <code>src/lib/payments.ts</code>.
          </p>
        ) : (
          <table className="w-full text-[16px] border-collapse">
            <tbody>
              {(await orders.listAll(20)).map((o) => (
                <tr key={o.id} className="border-b border-[color:var(--line)]">
                  <td className="py-[10px]">{o.description}</td>
                  <td className="py-[10px] tabular-nums">{o.credits} credits</td>
                  <td className="py-[10px]"><Pill tone={o.status === 'paid' ? 'good' : 'warn'}>{o.status}</Pill></td>
                  <td className="py-[10px] text-[color:var(--paper-ink-3)]">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </BrandScope>
  );
}
