import { requireStaff } from '@/lib/context';
import {
  bucketView, loadStorageSettingsSoft, orgOwnRetentionSoft, retentionHoursForSoft,
} from '@/lib/storage/buckets';
import { bucketsSoft } from '@/lib/storage/vault';
import StorageSettings from '@/components/admin/StorageSettings';
import { loadHfAuth } from '@/lib/auth-hf/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storage' };

export default async function OrgStoragePage({ searchParams }: {
  searchParams: { connected?: string };
}) {
  const { org } = await requireStaff();
  const store = await bucketsSoft(org.id);
  const mine = store.buckets.map(bucketView);
  const shared = (await bucketsSoft(null)).buckets.map(bucketView).map((b) => ({
    id: b.id, label: b.label, bucket: b.bucket, enabled: b.enabled,
  }));
  const platform = await loadStorageSettingsSoft();
  const own = await orgOwnRetentionSoft(org.id);
  const hfConnect = !!(process.env.HF_OAUTH_CLIENT_ID || (await loadHfAuth()).clientId);

  return (
    <div className="px-[34px] py-[34px]">
      <StorageSettings
        scope="org"
        initial={mine}
        shared={shared}
        retentionHours={own ?? await retentionHoursForSoft(org.id)}
        platformRetention={platform.retentionHours}
        hfConnect={hfConnect}
        trouble={store.trouble}
        connected={searchParams.connected}
      />
    </div>
  );
}
