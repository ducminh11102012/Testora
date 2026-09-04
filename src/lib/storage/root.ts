import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { sessionSecret } from '../session-secret';

/**
 * The one piece of configuration that cannot live in the cloud: the credentials
 * for the bucket everything else is kept in. It is asked for on the first run
 * and written to a local file, encrypted. Where the filesystem is read-only —
 * a serverless host, typically — environment variables stand in, and the setup
 * screen says so rather than pretending the save worked.
 */

export interface RootBucket {
  /** `hf` keeps the settings in a private dataset repo; `r2`/`s3` in a bucket. */
  kind: 'hf' | 'r2' | 's3';
  provider: 'r2' | 's3';
  accountId: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional public host for objects that are meant to be readable. */
  publicBaseUrl: string;
  label: string;
  /** Hugging Face, when `kind` is `hf`. */
  hfToken: string;
  hfRepoId: string;
  hfRevision: string;
}

const FILE = () => process.env.TESTORA_ROOT_CONFIG
  || resolve(process.cwd(), 'data', 'root-storage.json');

const KEY = () => scryptSync(Buffer.from(sessionSecret()), 'testora.root.v1', 32);

function seal(value: RootBucket): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

function open(blob: string): RootBucket | null {
  try {
    const [version, iv, tag, body] = blob.split('.');
    if (version !== 'v1') return null;
    const decipher = createDecipheriv('aes-256-gcm', KEY(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as RootBucket;
  } catch {
    return null;
  }
}

export function r2Endpoint(accountId: string): string {
  return `https://${accountId.trim()}.r2.cloudflarestorage.com`;
}

/** Environment variables, for hosts where the disk is not writable. */
function fromEnv(): RootBucket | null {
  // Hugging Face first: it is the primary store the product is built around.
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '';
  const hfRepoId = process.env.HF_REPO || process.env.HF_DATASET || '';
  if (hfToken && hfRepoId) {
    return {
      kind: 'hf',
      provider: 'r2',
      accountId: '', bucket: '', region: 'auto', endpoint: '',
      accessKeyId: '', secretAccessKey: '', publicBaseUrl: '',
      label: process.env.HF_LABEL || 'Hugging Face (private)',
      hfToken,
      hfRepoId,
      hfRevision: process.env.HF_REVISION || 'main',
    };
  }

  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT
    || (accountId ? r2Endpoint(accountId) : '');
  const bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const provider = process.env.S3_ENDPOINT ? 's3' : 'r2';
  return {
    kind: provider,
    provider,
    accountId,
    bucket,
    region: process.env.R2_REGION || process.env.S3_REGION || 'auto',
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
    label: process.env.R2_LABEL || 'Primary bucket',
    hfToken: '', hfRepoId: '', hfRevision: 'main',
  };
}

let cached: { at: number; value: RootBucket | null } | null = null;

/** The bucket everything is stored in, or null when the platform is unconfigured. */
export function rootBucket(): RootBucket | null {
  if (cached && Date.now() - cached.at < 5_000) return cached.value;
  let value = fromEnv();
  if (!value) {
    try {
      value = open(readFileSync(FILE(), 'utf8').trim());
    } catch {
      value = null;
    }
  }
  cached = { at: Date.now(), value };
  return value;
}

export function rootConfigured(): boolean {
  return !!rootBucket();
}

/** Where the credentials came from, which the console shows plainly. */
export function rootSource(): 'env' | 'file' | 'none' {
  if (fromEnv()) return 'env';
  return rootBucket() ? 'file' : 'none';
}

export interface SaveResult { ok: boolean; path?: string; error?: string }

export function saveRootBucket(value: RootBucket): SaveResult {
  const path = FILE();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, seal(value), { mode: 0o600 });
    cached = { at: Date.now(), value };
    return { ok: true, path };
  } catch (err) {
    cached = null;
    return { ok: false, error: (err as Error).message };
  }
}

/** The environment variables to set when the disk cannot be written to. */
export function envRecipe(value: RootBucket): Record<string, string> {
  if (value.kind === 'hf') {
    return {
      HF_TOKEN: value.hfToken,
      HF_REPO: value.hfRepoId,
      ...(value.hfRevision && value.hfRevision !== 'main' ? { HF_REVISION: value.hfRevision } : {}),
    };
  }
  return {
    R2_ACCOUNT_ID: value.accountId,
    R2_ENDPOINT: value.endpoint,
    R2_BUCKET: value.bucket,
    R2_REGION: value.region,
    R2_ACCESS_KEY_ID: value.accessKeyId,
    R2_SECRET_ACCESS_KEY: value.secretAccessKey,
    ...(value.publicBaseUrl ? { R2_PUBLIC_BASE_URL: value.publicBaseUrl } : {}),
  };
}
