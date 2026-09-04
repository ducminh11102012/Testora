import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { brandingOf, orgs, orgApplications } from '@/lib/db';
import { loadSmtp, publicSmtp } from '@/lib/mail/config';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import PlatformNav from '@/components/PlatformNav';
import EmailSettings from '@/components/admin/EmailSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email' };

export default async function EmailPage() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const config = publicSmtp(await loadSmtp());

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/email" pending={pending} />
        <EmailSettings initial={config} />
      </main>
    </BrandScope>
  );
}
