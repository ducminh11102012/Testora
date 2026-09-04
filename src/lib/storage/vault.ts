import {
  DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { sessionSecret } from '../session-secret';
import { RootBucket, rootBucket } from './root';
import { HfTarget, getFile, putFile } from './hf';

/**
 * Everything the platform needs to configure itself, kept as one encrypted
 * object inside the private bucket — extra buckets and their keys, the AI
 * provider key, the SMTP password, retention rules. None of it touches the
 * database, so a leaked database gives up no credentials at all.
 */

export interface VaultBucket {
  id: string;
  /** null: a platform target, offered to every organisation. */
  orgId: string | null;
  label: string;
  /** Hugging Face is the primary store; a bucket is the backup. */
  kind: 'hf' | 's3';
  /**
   * Public targets carry the community bank, private ones a school's papers.
   * A tenant's uploads are never written to a public target.
   */
  visibility: 'public' | 'private';
  /** Hugging Face, when `kind` is `hf`. */
  hfToken?: string;
  hfRepoId?: string;
  hfRevision?: string;
  provider: 'r2' | 's3';
  accountId: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  enabled: boolean;
  /** true for the bucket named in the local config: it cannot be removed here. */
  root?: boolean;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface Vault {
  version: 1;
  buckets: VaultBucket[];
  storage: { retentionHours: number; mirrorToAll: boolean };
  /** Per-organisation retention, which may only be stricter than the platform's. */
  orgRetention: Record<string, number>;
  /** Legacy single AI provider, kept so an old vault still reads. */
  ai: Record<string, unknown>;
  /** The parsing and marking providers, and whether one serves both. */
  aiSettings?: Record<string, unknown>;
  smtp: Record<string, unknown>;
  updatedAt: string;
}

const OBJECT_KEY = 'testora/config/vault.enc';

export const EMPTY_VAULT: Vault = {
  version: 1,
  buckets: [],
  storage: { retentionHours: 0, mirrorToAll: true },
  orgRetention: {},
  ai: {},
  smtp: {},
  updatedAt: new Date(0).toISOString(),
};

/* ----------------------------------------------------------- encryption */

const KEY = () => scryptSync(Buffer.from(sessionSecret()), 'testora.vault.v1', 32);

function seal(value: Vault): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from('TSTV1'), iv, cipher.getAuthTag(), body]);
}

function open(blob: Buffer): Vault | null {
  try {
    if (blob.subarray(0, 5).toString() !== 'TSTV1') return null;
    const iv = blob.subarray(5, 17);
    const tag = blob.subarray(17, 33);
    const decipher = createDecipheriv('aes-256-gcm', KEY(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(blob.subarray(33)), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as Vault;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- client */

const clients = new Map<string, S3Client>();

export function s3For(b: { id?: string; endpoint: string; region: string; accessKeyId: string; secretAccessKey: string }): S3Client {
  const key = `${b.endpoint}|${b.accessKeyId}|${b.secretAccessKey}|${b.region}`;
  const hit = clients.get(key);
  if (hit) return hit;
  const client = new S3Client({
    region: b.region || 'auto',
    endpoint: b.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: b.accessKeyId, secretAccessKey: b.secretAccessKey },
  });
  clients.set(key, client);
  return client;
}

export function asHfTarget(b: { hfToken?: string; hfRepoId?: string; hfRevision?: string; visibility?: string }): HfTarget {
  return {
    token: b.hfToken ?? '',
    repoId: b.hfRepoId ?? '',
    private: b.visibility !== 'public',
    revision: b.hfRevision || 'main',
  };
}

function rootAsBucket(root: RootBucket): VaultBucket {
  return {
    id: 'root',
    orgId: null,
    label: root.label || (root.kind === 'hf' ? 'Hugging Face (private)' : 'Primary bucket'),
    kind: root.kind === 'hf' ? 'hf' : 's3',
    visibility: 'private',
    hfToken: root.hfToken,
    hfRepoId: root.hfRepoId,
    hfRevision: root.hfRevision,
    provider: root.provider,
    accountId: root.accountId,
    bucket: root.bucket,
    region: root.region,
    endpoint: root.endpoint,
    accessKeyId: root.accessKeyId,
    secretAccessKey: root.secretAccessKey,
    publicBaseUrl: root.publicBaseUrl,
    enabled: true,
    root: true,
    createdAt: new Date(0).toISOString(),
  };
}

/* ------------------------------------------------------------ read/write */

let cache: { at: number; value: Vault } | null = null;

export function forgetVault() { cache = null; }

/** Reads the configuration object, or the empty one on a fresh bucket. */
export async function readVault(force = false): Promise<Vault> {
  const root = rootBucket();
  if (!root) throw new Error('No storage is configured yet.');
  if (!force && cache && Date.now() - cache.at < 5_000) return cache.value;

  try {
    let bytes: Buffer | null;
    if (root.kind === 'hf') {
      bytes = await getFile(asHfTarget({ ...root, visibility: 'private' }), OBJECT_KEY);
    } else {
      const res = await s3For(root).send(new GetObjectCommand({ Bucket: root.bucket, Key: OBJECT_KEY }));
      bytes = Buffer.from(await res.Body!.transformToByteArray());
    }
    const value = (bytes && open(bytes)) || EMPTY_VAULT;
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NoSuchKey' || name === 'NotFound' || /404/.test((err as Error).message)) {
      cache = { at: Date.now(), value: EMPTY_VAULT };
      return EMPTY_VAULT;
    }
    throw err;
  }
}

/** Read, change, write. Always re-reads first so two admins do not clobber each other. */
export async function editVault(change: (v: Vault) => Vault | void): Promise<Vault> {
  const root = rootBucket();
  if (!root) throw new Error('No storage is configured yet.');
  const current = await readVault(true);
  const draft: Vault = JSON.parse(JSON.stringify(current));
  const returned = change(draft);
  const next: Vault = { ...(returned ?? draft), version: 1, updatedAt: new Date().toISOString() };

  const sealed = seal(next);
  if (root.kind === 'hf') {
    await putFile(asHfTarget({ ...root, visibility: 'private' }), OBJECT_KEY, sealed, 'Update settings');
  } else {
    await s3For(root).send(new PutObjectCommand({
      Bucket: root.bucket,
      Key: OBJECT_KEY,
      Body: sealed,
      ContentType: 'application/octet-stream',
      // Belt and braces: even a bucket left public serves this as a download.
      CacheControl: 'no-store',
    }));
  }
  cache = { at: Date.now(), value: next };
  return next;
}

/* ---------------------------------------------------------------- buckets */

/** Every bucket the platform knows about, the root one first. */
export async function allBuckets(): Promise<VaultBucket[]> {
  const root = rootBucket();
  if (!root) return [];
  const vault = await readVault();
  return [rootAsBucket(root), ...vault.buckets];
}

export async function platformBuckets(): Promise<VaultBucket[]> {
  return (await allBuckets()).filter((b) => b.orgId === null);
}

export async function orgBuckets(orgId: string): Promise<VaultBucket[]> {
  return (await allBuckets()).filter((b) => b.orgId === orgId);
}

/** What an organisation's uploads may be written to: its own, plus the shared ones. */
export async function usableBuckets(orgId: string): Promise<VaultBucket[]> {
  const all = await allBuckets();
  const own = all.filter((b) => b.orgId === orgId && b.enabled);
  const shared = all.filter((b) => b.orgId === null && b.enabled);
  return [...own, ...shared];
}

/**
 * Which targets a paper from this kind of organisation is written to, in the
 * order they are tried. The community bank goes to the public Hub repository;
 * a school's papers only ever go to private targets. Buckets come after the
 * Hub in both cases: they are the copy of last resort, not the shop window.
 */
export async function targetsFor(orgId: string, orgKind: string): Promise<VaultBucket[]> {
  const usable = await usableBuckets(orgId);
  const wantPublic = orgKind === 'platform' || orgKind === 'community';
  const hub = usable.filter((b) => b.kind === 'hf'
    && (wantPublic ? b.visibility === 'public' : b.visibility === 'private'));
  const buckets = usable.filter((b) => b.kind !== 'hf');
  return [...hub, ...buckets];
}

export async function bucketById(id: string): Promise<VaultBucket | null> {
  return (await allBuckets()).find((b) => b.id === id) ?? null;
}

export function newBucketId(): string {
  return randomUUID();
}

/* ------------------------------------------------------------- health */

export async function testBucket(b: VaultBucket): Promise<{ ok: true } | { ok: false; error: string }> {
  if (b.kind === 'hf') {
    const { testTarget } = await import('./hf');
    return testTarget(asHfTarget(b));
  }
  try {
    await s3For(b).send(new HeadBucketCommand({ Bucket: b.bucket }));
    const probe = `testora/.probe-${Date.now()}`;
    await s3For(b).send(new PutObjectCommand({
      Bucket: b.bucket, Key: probe, Body: Buffer.from('testora'), ContentType: 'text/plain',
    }));
    await s3For(b).send(new DeleteObjectCommand({ Bucket: b.bucket, Key: probe }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/* ------------------------------------------- reading it when it is down */

/**
 * The console that edits storage credentials must not need working storage to
 * open. It did: the settings object lives *in* the primary store, so an expired
 * key or an hour of Hugging Face downtime turned both storage screens into a
 * 500 — and the screen that was down was the only place to fix the reason it
 * was down. So reads for the console go through here: the trouble comes back as
 * a sentence instead of an exception, and the page renders with a banner and an
 * empty list. Writes still throw; there is no point pretending a save landed.
 */
export function troubleWith(err: unknown): string {
  const cause = (err as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? (err as { code?: string }).code ?? '';
  const message = (err as Error).message || String(err);
  if (/no storage is configured/i.test(message)) return 'No storage is configured yet.';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /fetch failed/i.test(message)) {
    return 'The primary store did not answer. It may be down, or the endpoint may be wrong.';
  }
  if (/403|forbidden|invalid|credential|signature|unauthor/i.test(message)) {
    return 'The primary store refused the credentials. The key may have been rotated or revoked.';
  }
  return `The primary store could not be read: ${message}`;
}

export async function readVaultSoft(): Promise<{ vault: Vault; trouble: string | null }> {
  try {
    return { vault: await readVault(), trouble: null };
  } catch (err) {
    return { vault: EMPTY_VAULT, trouble: troubleWith(err) };
  }
}

/** The buckets of one owner (`null` for the platform), or the reason there are none. */
export async function bucketsSoft(orgId: string | null): Promise<{
  buckets: VaultBucket[];
  trouble: string | null;
}> {
  const root = rootBucket();
  if (!root) return { buckets: [], trouble: null };
  const { vault, trouble } = await readVaultSoft();
  const all = trouble ? [rootAsBucket(root)] : [rootAsBucket(root), ...vault.buckets];
  return { buckets: all.filter((b) => b.orgId === orgId), trouble };
}
