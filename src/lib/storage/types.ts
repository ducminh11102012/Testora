/** Shapes the console needs; free of the database and the AWS client. */

export interface BucketInput {
  label: string;
  /** `hf` is a Hugging Face dataset repository; `s3` is R2 or any S3 bucket. */
  kind: 'hf' | 's3';
  /** Public targets carry the free community bank; private ones a school's. */
  visibility: 'public' | 'private';
  /** Hugging Face fields, when `kind` is `hf`. */
  hfRepoId: string;
  hfRevision: string;
  provider: 'r2' | 's3';
  accountId: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  publicBaseUrl: string;
  enabled: boolean;
}

export interface BucketView extends BucketInput {
  id: string;
  /** The public read URL of a Hub repository, for the console to link to. */
  hubUrl?: string;
  /** Null for a platform bucket, which every organisation may use. */
  orgId: string | null;
  /** The bucket named in the local config: it holds the settings themselves. */
  root: boolean;
  secretMasked: string;
  lastCheckedAt: string | null;
  lastError: string | null;
}

/** How long an uploaded paper is kept after it has been parsed. */
export const RETENTION_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: 'Delete as soon as parsing finishes' },
  { value: 1, label: 'Keep for 1 hour' },
  { value: 24, label: 'Keep for 24 hours' },
  { value: 24 * 7, label: 'Keep for 7 days' },
  { value: 24 * 30, label: 'Keep for 30 days' },
  { value: -1, label: 'Keep until deleted by hand' },
];

export interface StorageSettings {
  /** Hours. 0 deletes at the end of parsing, -1 keeps the file indefinitely. */
  retentionHours: number;
  /** Write the upload to every enabled bucket rather than just the first. */
  mirrorToAll: boolean;
}

export const STORAGE_FALLBACK: StorageSettings = { retentionHours: 0, mirrorToAll: true };

/** Cloudflare's endpoint for an account, which is all R2 needs. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId.trim()}.r2.cloudflarestorage.com`;
}
