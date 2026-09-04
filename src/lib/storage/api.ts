import { NextRequest, NextResponse } from 'next/server';
import { BucketInput, bucketView, createBucket, removeBucket, updateBucket } from './buckets';
import { r2Endpoint } from './root';
import { allBuckets, bucketById, editVault, testBucket, bucketsSoft } from './vault';

/**
 * The platform screen and the organisation screen are the same form over the
 * same store; only the owner differs. Both routes call these.
 */

function readInput(body: Record<string, unknown>): BucketInput & { secretAccessKey?: string; hfToken?: string } {
  const kind = body.kind === 'hf' ? 'hf' : 's3';
  const provider = body.provider === 's3' ? 's3' : 'r2';
  const accountId = String(body.accountId ?? '').trim();
  const endpoint = String(body.endpoint ?? '').trim()
    || (provider === 'r2' && accountId ? r2Endpoint(accountId) : '');
  return {
    label: String(body.label ?? '').trim(),
    kind,
    visibility: body.visibility === 'public' ? 'public' : 'private',
    hfRepoId: String(body.hfRepoId ?? '').trim(),
    hfRevision: String(body.hfRevision ?? '').trim() || 'main',
    provider,
    accountId,
    bucket: String(body.bucket ?? '').trim(),
    region: String(body.region ?? '').trim() || 'auto',
    endpoint,
    accessKeyId: String(body.accessKeyId ?? '').trim(),
    publicBaseUrl: String(body.publicBaseUrl ?? '').trim(),
    enabled: body.enabled !== false,
    secretAccessKey: typeof body.secretAccessKey === 'string' ? body.secretAccessKey : undefined,
    hfToken: typeof body.hfToken === 'string' ? body.hfToken : undefined,
  };
}

export async function listBuckets(orgId: string | null) {
  return (await allBuckets()).filter((b) => b.orgId === orgId).map(bucketView);
}

/** For the console: an unreachable store is an answer, not a 500. */
export async function listBucketsSoft(orgId: string | null) {
  const { buckets, trouble } = await bucketsSoft(orgId);
  return { buckets: buckets.map(bucketView), trouble };
}

export async function addBucket(req: NextRequest, orgId: string | null) {
  const body = await req.json().catch(() => ({}));
  const input = readInput(body);
  if (!input.label) return NextResponse.json({ error: 'Give it a name you will recognise.' }, { status: 400 });

  if (input.kind === 'hf') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(input.hfRepoId)) {
      return NextResponse.json({ error: 'Enter the dataset as namespace/name, for example my-school/papers.' }, { status: 400 });
    }
    if (!input.hfToken) return NextResponse.json({ error: 'Enter a Hugging Face write token.' }, { status: 400 });
  } else {
    if (!input.bucket) return NextResponse.json({ error: 'Enter the bucket name.' }, { status: 400 });
    if (!input.endpoint) return NextResponse.json({ error: 'Enter the account id (R2) or the endpoint.' }, { status: 400 });
    if (!input.accessKeyId || !input.secretAccessKey) {
      return NextResponse.json({ error: 'Enter both the access key id and the secret.' }, { status: 400 });
    }
  }

  const row = await createBucket({ ...input, orgId });
  const check = await testBucket(row);
  if (!check.ok) {
    await editVault((v) => {
      const b = v.buckets.find((x) => x.id === row.id);
      if (b) { b.lastCheckedAt = new Date().toISOString(); b.lastError = check.error; }
    });
  }
  const fresh = (await bucketById(row.id)) ?? row;
  return NextResponse.json({
    ok: true,
    bucket: bucketView(fresh),
    tested: check.ok,
    error: check.ok ? undefined : check.error,
  });
}

/** Edits, enables, disables, tests or removes one bucket the caller owns. */
export async function changeBucket(req: NextRequest, orgId: string | null) {
  const body = await req.json().catch(() => ({}));
  const row = await bucketById(String(body.id ?? ''));
  if (!row || row.orgId !== orgId) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (row.root && (body.action === 'remove' || body.enabled === false)) {
    return NextResponse.json({
      error: 'This is the bucket the settings themselves live in. Change it in the local configuration.',
    }, { status: 400 });
  }

  if (body.action === 'remove') {
    await removeBucket(row.id);
    return NextResponse.json({ ok: true, removed: row.id });
  }
  if (body.action === 'test') {
    const check = await testBucket(row);
    if (!row.root) {
      await editVault((v) => {
        const b = v.buckets.find((x) => x.id === row.id);
        if (b) { b.lastCheckedAt = new Date().toISOString(); b.lastError = check.ok ? null : check.error; }
      });
    }
    const fresh = (await bucketById(row.id)) ?? row;
    return NextResponse.json({
      ok: check.ok, error: check.ok ? undefined : check.error, bucket: bucketView(fresh),
    });
  }

  const input = readInput({ ...bucketView(row), ...body });
  const updated = await updateBucket(row.id, { ...input, secretAccessKey: input.secretAccessKey });
  return NextResponse.json({ ok: true, bucket: updated ? bucketView(updated) : undefined });
}
