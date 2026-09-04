import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readSession } from '@/lib/auth';
import { users } from '@/lib/db';
import { setupStep } from '@/lib/gate';
import { RootBucket, envRecipe, r2Endpoint, rootConfigured, saveRootBucket } from '@/lib/storage/root';
import { forgetVault, readVault, s3For } from '@/lib/storage/vault';
import { testTarget } from '@/lib/storage/hf';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Step one of a first run: the bucket everything else is kept in. The
 * credentials are written to a local file rather than to the database, because
 * they are the key to the database's replacement.
 */
export async function POST(req: NextRequest) {
  /*
   * Whether this platform has been claimed is decided by the database, not by
   * the local storage file. The file lives on the machine's own disk, which a
   * serverless host throws away on every deployment — gating on it meant that
   * after a redeploy any visitor could repoint the platform's vault at their
   * own bucket. Once an administrator exists, only an administrator may.
   */
  if ((await users.platformAdminCount()) > 0 && !(await readSession())?.isPlatformAdmin) {
    return NextResponse.json({
      error: 'This platform already has an administrator, so only they can change where storage points.',
    }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = body.kind === 'hf' ? 'hf' : (body.provider === 's3' ? 's3' : 'r2');
  const provider = body.provider === 's3' ? 's3' : 'r2';
  const accountId = String(body.accountId ?? '').trim();
  const value: RootBucket = {
    kind,
    hfToken: String(body.hfToken ?? '').trim(),
    hfRepoId: String(body.hfRepoId ?? '').trim(),
    hfRevision: String(body.hfRevision ?? '').trim() || 'main',
    provider,
    accountId,
    bucket: String(body.bucket ?? '').trim(),
    region: String(body.region ?? '').trim() || 'auto',
    endpoint: String(body.endpoint ?? '').trim() || (provider === 'r2' && accountId ? r2Endpoint(accountId) : ''),
    accessKeyId: String(body.accessKeyId ?? '').trim(),
    secretAccessKey: String(body.secretAccessKey ?? ''),
    publicBaseUrl: String(body.publicBaseUrl ?? '').trim(),
    label: String(body.label ?? '').trim() || 'Primary bucket',
  };

  if (value.kind === 'hf') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(value.hfRepoId)) {
      return NextResponse.json({
        error: 'Enter the dataset as namespace/name, for example my-school/testora-private.',
      }, { status: 400 });
    }
    if (!value.hfToken) return NextResponse.json({ error: 'Enter a Hugging Face write token.' }, { status: 400 });
  } else {
    if (!value.bucket) return NextResponse.json({ error: 'Enter the bucket name.' }, { status: 400 });
    if (!value.endpoint) return NextResponse.json({ error: 'Enter the account id (R2) or a full endpoint.' }, { status: 400 });
    if (!value.accessKeyId || !value.secretAccessKey) {
      return NextResponse.json({ error: 'Enter both the access key id and the secret.' }, { status: 400 });
    }
  }

  // Prove the credentials work before writing them anywhere.
  if (value.kind === 'hf') {
    const check = await testTarget({
      token: value.hfToken, repoId: value.hfRepoId, private: true, revision: value.hfRevision,
    });
    if (!check.ok) {
      return NextResponse.json({ error: `Hugging Face refused: ${check.error}` }, { status: 502 });
    }
  } else {
    const client = s3For(value);
    try {
      await client.send(new HeadBucketCommand({ Bucket: value.bucket }));
      const probe = `testora/.probe-${Date.now()}`;
      await client.send(new PutObjectCommand({
        Bucket: value.bucket, Key: probe, Body: Buffer.from('testora'), ContentType: 'text/plain',
      }));
      await client.send(new DeleteObjectCommand({ Bucket: value.bucket, Key: probe }));
    } catch (err) {
      return NextResponse.json({
        error: `The bucket refused the connection: ${(err as Error).message}`,
      }, { status: 502 });
    }
  }

  const saved = saveRootBucket(value);
  forgetVault();
  if (!saved.ok) {
    // A read-only filesystem, which is normal on a serverless host: hand back
    // the variables to paste instead of pretending it was stored.
    return NextResponse.json({ ok: false, readOnly: true, error: saved.error, env: envRecipe(value) });
  }

  // Touch the settings object so the bucket has one from the start.
  await readVault(true).catch(() => null);
  return NextResponse.json({ ok: true, path: saved.path, next: await setupStep() });
}

export async function GET() {
  return NextResponse.json({ configured: rootConfigured(), step: await setupStep() });
}
