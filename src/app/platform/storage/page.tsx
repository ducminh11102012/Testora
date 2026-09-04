import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/context';
import { brandingOf, orgs, orgApplications } from '@/lib/db';
import { bucketView, loadStorageSettingsSoft } from '@/lib/storage/buckets';
import { bucketsSoft } from '@/lib/storage/vault';
import { rootSource } from '@/lib/storage/root';
import { loadHfAuth } from '@/lib/auth-hf/config';
import BrandScope from '@/components/BrandScope';
import PageHeader from '@/components/ui/Shell';
import LogoutButton from '@/components/LogoutButton';
import PlatformNav from '@/components/PlatformNav';
import StorageSettings from '@/components/admin/StorageSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storage' };

export default async function PlatformStoragePage({ searchParams }: {
  searchParams: { connected?: string };
}) {
  await requirePlatformAdmin();
  const branding = brandingOf(await orgs.platform());
  const pending = await orgApplications.pendingCount();
  const store = await bucketsSoft(null);
  const buckets = store.buckets.map(bucketView);
  const settings = await loadStorageSettingsSoft();
  const hfConnect = !!(process.env.HF_OAUTH_CLIENT_ID || (await loadHfAuth()).clientId);

  return (
    <BrandScope branding={branding}>
      <PageHeader
        branding={branding}
        subtitle="Platform administration"
        href="/admin"
        right={<><Link href="/admin" className="hover:underline">Back to console</Link><LogoutButton /></>}
      />
      <main className="max-w-[1180px] mx-auto px-[28px] py-[36px]">
        <PlatformNav current="/platform/storage" pending={pending} />
        <StorageSettings
          scope="platform"
          initial={buckets}
          retentionHours={settings.retentionHours}
          mirrorToAll={settings.mirrorToAll}
          rootSource={rootSource()}
          trouble={store.trouble}
          hfConnect={hfConnect}
          connected={searchParams.connected}
        />
      </main>
    </BrandScope>
  );
}
