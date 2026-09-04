import { NextRequest, NextResponse } from 'next/server';
import { isResponse, staffContext } from '@/lib/api-guard';
import { addBucket, changeBucket, listBucketsSoft } from '@/lib/storage/api';
import {
  bucketView, loadStorageSettingsSoft, orgOwnRetentionSoft, retentionHoursForSoft, setOrgRetention,
} from '@/lib/storage/buckets';
import { bucketsSoft } from '@/lib/storage/vault';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const { buckets, trouble } = await listBucketsSoft(ctx.org.id);
  return NextResponse.json({
    buckets,
    trouble,
    shared: (await bucketsSoft(null)).buckets.map(bucketView).map((b) => ({
      id: b.id, label: b.label, bucket: b.bucket, enabled: b.enabled,
    })),
    platform: await loadStorageSettingsSoft(),
    retentionHours: await retentionHoursForSoft(ctx.org.id),
    ownRetention: await orgOwnRetentionSoft(ctx.org.id),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  return addBucket(req, ctx.org.id);
}

export async function PATCH(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  return changeBucket(req, ctx.org.id);
}

/** The organisation's own retention rule, which may only be stricter. */
export async function PUT(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const body = await req.json().catch(() => ({}));
  const raw = body.retentionHours;
  const hours = raw === null || raw === '' ? null : Number(raw);
  const effective = await setOrgRetention(ctx.org.id, hours);
  return NextResponse.json({ ok: true, retentionHours: effective });
}
