import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { emptyContent } from '@/types/exam';

export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  return NextResponse.json({
    tests: tests.listOrg(ctx.org.id).map((t) => ({ ...t, content: undefined, attempts: tests.attemptCount(t.id) })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const content = body.content ?? emptyContent(body.module ?? 'reading');
  if (body.title) content.title = body.title;

  const test = tests.create({
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
