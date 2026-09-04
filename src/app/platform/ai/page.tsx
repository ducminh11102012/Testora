import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { brandingOf, orgs, orgApplications } from '@/lib/db';
import { loadAiSettings, publicAiSettings } from '@/lib/ai/config';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import PlatformNav from '@/components/PlatformNav';
import LogoutButton from '@/components/LogoutButton';
import AiSettings from '@/components/admin/AiSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI settings' };

export default async function AiSettingsPage() {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const settings = publicAiSettings(await loadAiSettings());

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/ai" pending={pending} />
        <h1 className="text-[32px] font-semibold mb-[8px]">AI settings</h1>
        <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[28px] max-w-[70ch]">
          Reading papers and marking them are separate jobs, each with its own endpoint, key and
          model — or one provider for both, if that is simpler. Organisations never enter their own
          keys; their usage is metered here.
        </p>
        <AiSettings initial={settings} />
      </main>
    </BrandScope>
  );
}
