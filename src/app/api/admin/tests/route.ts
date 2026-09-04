import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { emptyContent } from '@/types/exam';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  // Metadata and counts in one query; the papers themselves stay in the
  // database, which is where a list of papers wants them.
  const rows = await tests.listOrgWithCounts(ctx.org.id);
  return NextResponse.json({
    tests: rows.map((t) => ({ ...t, attempts: Number(t.attemptCount) || 0 })),
  });
}

export async function POST(req: NextRequest) {
  // Writing papers is a teacher's job, not just an administrator's.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const content = body.content ?? emptyContent(body.module ?? 'reading');
  if (body.title) content.title = body.title;

  const test = await tests.create({
    orgId: ctx.org.id,
    title: content.title,
    module: content.module,
    variant: content.variant ?? 'academic',
    durationMin: content.durationMinutes ?? 60,
    status: 'draft',
    content: JSON.stringify(content),
  });
  return NextResponse.json({ id: test.id });
}
