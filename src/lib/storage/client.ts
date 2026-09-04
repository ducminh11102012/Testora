import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { VaultBucket, asHfTarget, editVault, s3For } from './vault';
import { deleteFile, putFile } from './hf';

export interface WriteResult { bucketId: string; label: string; ok: boolean; error?: string }

/** Records the outcome of a write against the bucket, so the console can show it. */
async function note(bucketId: string, error: string | null) {
  if (bucketId === 'root') return;
  await editVault((v) => {
    const b = v.buckets.find((x) => x.id === bucketId);
    if (b) { b.lastCheckedAt = new Date().toISOString(); b.lastError = error; }
  }).catch(() => {});
}

/**
 * Writes the same object to every bucket given, at the same time. A bucket that
 * fails is reported rather than thrown, so one broken mirror cannot lose an
 * import that succeeded everywhere else.
 */
export async function putObject(
  buckets: VaultBucket[], key: string, body: Buffer, contentType: string,
): Promise<WriteResult[]> {
  return Promise.all(buckets.map(async (b): Promise<WriteResult> => {
    try {
      if (b.kind === 'hf') {
        await putFile(asHfTarget(b), key, body, `Add ${key.split('/').pop()}`);
      } else {
        await s3For(b).send(new PutObjectCommand({
          Bucket: b.bucket, Key: key, Body: body, ContentType: contentType,
        }));
      }
      await note(b.id, null);
      return { bucketId: b.id, label: b.label, ok: true };
    } catch (err) {
      const error = (err as Error).message;
      await note(b.id, error);
      return { bucketId: b.id, label: b.label, ok: false, error };
    }
  }));
}

/** Removes the object everywhere it was written. Already gone counts as success. */
export async function deleteObject(buckets: VaultBucket[], key: string): Promise<WriteResult[]> {
  return Promise.all(buckets.map(async (b): Promise<WriteResult> => {
    try {
      if (b.kind === 'hf') await deleteFile(asHfTarget(b), key);
      else await s3For(b).send(new DeleteObjectCommand({ Bucket: b.bucket, Key: key }));
      return { bucketId: b.id, label: b.label, ok: true };
    } catch (err) {
      return { bucketId: b.id, label: b.label, ok: false, error: (err as Error).message };
    }
  }));
}

/** A link good for a few minutes, for fetching a paper before it expires. */
export async function signedUrl(b: VaultBucket, key: string, seconds = 300): Promise<string> {
  if (b.kind === 'hf') {
    const { fileUrl } = await import('./hf');
    return fileUrl(asHfTarget(b), key);
  }
  if (b.publicBaseUrl) return `${b.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  return getSignedUrl(s3For(b), new GetObjectCommand({ Bucket: b.bucket, Key: key }), { expiresIn: seconds });
}

export { testBucket } from './vault';
