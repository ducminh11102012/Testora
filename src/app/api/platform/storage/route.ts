import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { addBucket, changeBucket, listBucketsSoft } from '@/lib/storage/api';
import { loadStorageSettingsSoft, saveStorageSettings } from '@/lib/storage/buckets';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const user = await readSession();
  return user?.isPlatformAdmin ? user : null;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { buckets, trouble } = await listBucketsSoft(null);
  return NextResponse.json({ buckets, trouble, settings: await loadStorageSettingsSoft() });
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return addBucket(req, null);
}

export async function PATCH(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return changeBucket(req, null);
}

/** Retention and mirroring, which are platform-wide. */
export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const settings = await saveStorageSettings({
    retentionHours: Number.isFinite(Number(body.retentionHours)) ? Number(body.retentionHours) : undefined,
    mirrorToAll: body.mirrorToAll === undefined ? undefined : !!body.mirrorToAll,
  });
  return NextResponse.json({ ok: true, settings });
}
