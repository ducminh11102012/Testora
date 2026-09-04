import { orgs, settingsOf } from '../db';
import { BucketInput, BucketView, StorageSettings } from './types';
import { VaultBucket, allBuckets, editVault, newBucketId, readVault, readVaultSoft } from './vault';

export * from './types';

/** Never let a secret reach the browser: the console sees the shape of one. */
function mask(secret: string): string {
  if (!secret) return '';
  return secret.length <= 8 ? '••••' : `${secret.slice(0, 3)}…${secret.slice(-3)}`;
}

export function bucketView(b: VaultBucket): BucketView {
  return {
    id: b.id,
    orgId: b.orgId,
    label: b.label,
    kind: b.kind ?? 's3',
    visibility: b.visibility ?? 'private',
    hfRepoId: b.hfRepoId ?? '',
    hfRevision: b.hfRevision ?? 'main',
    hubUrl: b.kind === 'hf' && b.hfRepoId ? `https://huggingface.co/datasets/${b.hfRepoId}` : undefined,
    provider: b.provider,
    accountId: b.accountId,
    bucket: b.bucket,
    region: b.region,
    endpoint: b.endpoint,
    accessKeyId: b.accessKeyId,
    publicBaseUrl: b.publicBaseUrl,
    enabled: b.enabled,
    root: !!b.root,
    secretMasked: mask(b.kind === 'hf' ? (b.hfToken ?? '') : b.secretAccessKey),
    lastCheckedAt: b.lastCheckedAt ?? null,
    lastError: b.lastError ?? null,
  };
}

export async function loadStorageSettings(): Promise<StorageSettings> {
  return (await readVault()).storage;
}

/** The same, for screens that must open even when the store is unreachable. */
export async function loadStorageSettingsSoft(): Promise<StorageSettings> {
  return (await readVaultSoft()).vault.storage;
}

export async function saveStorageSettings(patch: Partial<StorageSettings>): Promise<StorageSettings> {
  const vault = await editVault((v) => {
    v.storage = { ...v.storage, ...patch };
  });
  return vault.storage;
}

/**
 * An organisation may keep its own rule; without one it follows the platform.
 * The shorter of the two wins, so a centre that wants its papers gone quickly
 * is never overridden by a laxer platform default.
 */
export async function retentionHoursFor(orgId: string): Promise<number> {
  const vault = await readVault();
  const platform = vault.storage.retentionHours;
  const own = vault.orgRetention[orgId];
  if (own === undefined || own === null) return platform;
  if (own < 0) return platform;
  if (platform < 0) return own;
  return Math.min(own, platform);
}

export async function setOrgRetention(orgId: string, hours: number | null): Promise<number> {
  await editVault((v) => {
    if (hours === null) delete v.orgRetention[orgId];
    else v.orgRetention[orgId] = hours;
  });
  return retentionHoursFor(orgId);
}

/** Kept for the organisation settings screen, which shows the effective rule. */
export async function orgOwnRetention(orgId: string): Promise<number | null> {
  const vault = await readVault();
  const own = vault.orgRetention[orgId];
  return own === undefined ? null : own;
}

/**
 * The console versions. A screen showing a number may fall back to the default
 * when the store is unreachable; the *deletion* path may not, which is why the
 * hard versions above stay and keep throwing — a sweep that cannot read the
 * rule must stop, not guess a retention of nothing and delete a school's papers.
 */
export async function retentionHoursForSoft(orgId: string): Promise<number> {
  const { vault } = await readVaultSoft();
  const own = vault.orgRetention[orgId];
  if (own === undefined || own === null || own < 0) return vault.storage.retentionHours;
  if (vault.storage.retentionHours < 0) return own;
  return Math.min(own, vault.storage.retentionHours);
}

export async function orgOwnRetentionSoft(orgId: string): Promise<number | null> {
  const own = (await readVaultSoft()).vault.orgRetention[orgId];
  return own === undefined ? null : own;
}

export async function createBucket(
  input: BucketInput & { orgId: string | null; secretAccessKey?: string; hfToken?: string },
): Promise<VaultBucket> {
  const row: VaultBucket = {
    id: newBucketId(),
    orgId: input.orgId,
    label: input.label,
    kind: input.kind,
    visibility: input.visibility,
    hfToken: input.hfToken ?? '',
    hfRepoId: input.hfRepoId,
    hfRevision: input.hfRevision || 'main',
    provider: input.provider,
    accountId: input.accountId,
    bucket: input.bucket,
    region: input.region || 'auto',
    endpoint: input.endpoint,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey ?? '',
    publicBaseUrl: input.publicBaseUrl,
    enabled: input.enabled,
    lastCheckedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  await editVault((v) => { v.buckets.push(row); });
  return row;
}

export async function updateBucket(
  bucketId: string, patch: Partial<BucketInput> & { secretAccessKey?: string; hfToken?: string },
): Promise<VaultBucket | null> {
  let updated: VaultBucket | null = null;
  await editVault((v) => {
    const b = v.buckets.find((x) => x.id === bucketId);
    if (!b) return;
    for (const key of [
      'label', 'kind', 'visibility', 'hfRepoId', 'hfRevision',
      'provider', 'accountId', 'bucket', 'region', 'endpoint', 'accessKeyId', 'publicBaseUrl',
    ] as const) {
      const value = patch[key];
      if (value !== undefined) (b as unknown as Record<string, unknown>)[key] = value;
    }
    if (patch.enabled !== undefined) b.enabled = patch.enabled;
    if (patch.secretAccessKey) b.secretAccessKey = patch.secretAccessKey;
    if (patch.hfToken) b.hfToken = patch.hfToken;
    updated = b;
  });
  return updated;
}

export async function removeBucket(bucketId: string): Promise<void> {
  await editVault((v) => { v.buckets = v.buckets.filter((b) => b.id !== bucketId); });
}

/** Convenience for screens that show what an organisation is actually using. */
export async function bucketsFor(scope: 'platform' | string): Promise<VaultBucket[]> {
  const all = await allBuckets();
  return scope === 'platform' ? all.filter((b) => b.orgId === null) : all.filter((b) => b.orgId === scope);
}

/** Organisation settings still hold non-secret preferences; this reads them. */
export async function orgSettings(orgId: string) {
  const org = await orgs.byId(orgId);
  return org ? settingsOf(org) : null;
}
