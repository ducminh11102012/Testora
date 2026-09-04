import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { ExamContent } from '@/types/exam';
import { preflight } from '@/lib/preflight';
import { normaliseContent } from '@/lib/parse/normalize';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...test, content: JSON.parse(test.content) });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  // Editing a paper is teaching work; a teacher may do it in their own org.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if (body.visibility) {
    const allowed = ['private', 'catalog', 'sitting', 'suite'];
    if (!allowed.includes(String(body.visibility))) {
      return NextResponse.json({ error: 'That is not one of the ways a paper can be listed.' }, { status: 400 });
    }
    patch.visibility = String(body.visibility);
  }
  // Whether a full test may be built out of this paper at random.
  if (body.bank !== undefined) patch.bank = body.bank ? 1 : 0;
  // The folder it is filed under, for staff and candidates alike.
  if (body.folder !== undefined) {
    const folder = String(body.folder ?? '').trim().slice(0, 80);
    patch.folder = folder || null;
  }
  /*
   * Sharing a paper with every organisation on the platform is the platform's
   * own decision: the Testora library is Testora's. A school sharing a paper
   * would also share a recording that the media endpoint keeps to that school,
   * so the copy would arrive silent.
   */
  if (body.shared !== undefined) {
    if (ctx.org.kind !== 'platform' && !ctx.user.isPlatformAdmin) {
      return NextResponse.json({
        error: 'Only the platform can put a paper in the shared library.',
      }, { status: 403 });
    }
    patch.shared = body.shared ? 1 : 0;
  }
  if (body.priceCredits !== undefined) patch.priceCredits = Number(body.priceCredits) || 0;
  if (body.content) {
    try {
      const { content } = normaliseContent(body.content);
      patch.content = JSON.stringify(content);
      patch.title = content.title;
      patch.module = content.module;
      patch.variant = content.variant ?? 'academic';
      patch.durationMin = content.durationMinutes;
    } catch (err) {
      return NextResponse.json({ error: `The paper could not be saved: ${(err as Error).message}` }, { status: 400 });
    }
  }
  /*
   * A paper only goes live if it can actually be sat. The full checklist runs
   * here — duplicate numbers, gaps with no question behind them, questions with
   * nothing to mark against, a listening paper with no recording — because a
   * paper that reaches a candidate broken cannot be taken back: the sitting is
   * happening, and there is no second chance at it.
   */
  if (patch.status === 'published') {
    const source = (patch.content as string | undefined) ?? test.content;
    const paper = JSON.parse(source) as ExamContent;
    const report = preflight(paper);
    if (report.blocking.length) {
      return NextResponse.json({
        error: `This paper cannot go live yet. ${report.blocking[0].message}`,
        blocking: report.blocking,
        advisory: report.advisory,
      }, { status: 409 });
    }
  }

  const updated = await tests.update(params.id, patch);
  return NextResponse.json({ ok: true, updatedAt: updated?.updatedAt });
}

/**
 * Deleting a paper takes its attempts and results with it, because a result
 * without its paper cannot be read back. A paper anybody has sat therefore
 * needs a second, explicit confirmation, and the first refusal says how many
 * attempts would go.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext('manage');
  if (isResponse(ctx)) return ctx;
  const test = await tests.byId(params.id);
  if (!test || !await sameOrg(ctx, test.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const attempts = await tests.attemptCount(params.id);
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (attempts > 0 && !force) {
    return NextResponse.json({
      error: `${attempts} candidate attempt${attempts === 1 ? '' : 's'} would be deleted with this paper, `
        + 'including the results. Confirm to delete both, or unpublish the paper instead.',
      needsConfirmation: true,
      attempts,
    }, { status: 409 });
  }

  await tests.remove(params.id);
  return NextResponse.json({ ok: true, deletedAttempts: attempts });
}
