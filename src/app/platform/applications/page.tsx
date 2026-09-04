import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { brandingOf, orgApplications, orgs } from '@/lib/db';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import PlatformNav from '@/components/PlatformNav';
import LogoutButton from '@/components/LogoutButton';
import ApplicationQueue from '@/components/admin/ApplicationQueue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Applications' };

export default async function ApplicationsPage() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const applications = await orgApplications.list();

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/applications" pending={pending} />
        <h1 className="text-[32px] font-semibold mb-[8px]">Applications</h1>
        <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[28px] max-w-[70ch]">
          Schools and centres asking for a space of their own, from the public form at{' '}
          <code>/apply</code>. Approving one creates the organisation and its owner account.
        </p>
        <ApplicationQueue applications={applications} />
      </main>
    </BrandScope>
  );
}
