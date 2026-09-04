import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { ExamContent } from '@/types/exam';
import { preflight } from '@/lib/preflight';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What is wrong with this paper, before a candidate finds out.
 *
 * GET checks the saved paper; POST checks a draft the editor is holding, so a
 * teacher can see the list update as they fix things rather than after saving.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(preflight(JSON.parse(test.content) as ExamContent));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const content = body.content ?? JSON.parse(test.content);
  try {
    return NextResponse.json(preflight(content as ExamContent));
  } catch (err) {
    return NextResponse.json({ error: `That draft could not be checked: ${(err as Error).message}` }, { status: 400 });
  }
}
