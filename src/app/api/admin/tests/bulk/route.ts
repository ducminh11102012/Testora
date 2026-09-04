import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';
import { ExamContent } from '@/types/exam';
import { preflight } from '@/lib/preflight';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 200;

/**
 * The same change to many papers at once.
 *
 * A book arrives forty papers at a time, so the things a teacher then wants to
 * do — file them, put them in the bank, publish the ones that are ready, throw
 * away a bad import — are things they want to do to all of them. Doing that one
 * paper at a time is not a workflow, it is a punishment.
 *
 * Every action names the organisation in its own condition, so a stray id from
 * another tenant changes nothing rather than being taken on trust.
 */
export async function POST(req: NextRequest) {
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, MAX);
  const action = String(body.action ?? '');
  if (!ids.length) return NextResponse.json({ error: 'Nothing was selected.' }, { status: 400 });

  switch (action) {
    case 'folder': {
      const folder = String(body.value ?? '').trim().slice(0, 80);
      const changed = await tests.bulkUpdate(ctx.org.id, ids, { folder: folder || null });
      return NextResponse.json({
        ok: true, changed,
        message: folder
          ? `${changed} paper(s) filed under “${folder}”.`
          : `${changed} paper(s) taken out of their folder.`,
      });
    }
    case 'bank': {
      const changed = await tests.bulkUpdate(ctx.org.id, ids, { bank: body.value ? 1 : 0 });
      return NextResponse.json({
        ok: true, changed,
        message: body.value
          ? `${changed} paper(s) added to the bank — full tests can be built from them.`
          : `${changed} paper(s) taken out of the bank.`,
      });
    }
    case 'visibility': {
      const allowed = ['private', 'catalog', 'sitting', 'suite'];
      const value = String(body.value ?? '');
      if (!allowed.includes(value)) {
        return NextResponse.json({ error: 'That is not one of the ways a paper can be listed.' }, { status: 400 });
      }
      const changed = await tests.bulkUpdate(ctx.org.id, ids, { visibility: value as never });
      return NextResponse.json({ ok: true, changed, message: `${changed} paper(s) updated.` });
    }
    case 'unpublish': {
      const changed = await tests.bulkUpdate(ctx.org.id, ids, { status: 'draft' });
      return NextResponse.json({ ok: true, changed, message: `${changed} paper(s) taken off the list.` });
    }
    case 'publish': {
      /*
       * Publishing in bulk still checks every paper. A batch that publishes
       * whatever it is given is how a broken paper reaches a candidate: the
       * teacher publishing forty at once is precisely the person who has not
       * opened each one.
       */
      const papers = await tests.byIds(ids.filter(Boolean));
      const mine = papers.filter((paper) => paper.orgId === ctx.org.id);
      const ready: string[] = [];
      const refused: Array<{ id: string; title: string; reason: string }> = [];
      for (const paper of mine) {
        const report = preflight(JSON.parse(paper.content) as ExamContent);
        if (report.blocking.length) {
          refused.push({ id: paper.id, title: paper.title, reason: report.blocking[0].message });
        } else {
          ready.push(paper.id);
        }
      }
      const changed = await tests.bulkUpdate(ctx.org.id, ready, { status: 'published' });
      return NextResponse.json({
        ok: true,
        changed,
        refused,
        message: refused.length
          ? `${changed} paper(s) published. ${refused.length} could not be: ${refused.slice(0, 3).map((r) => r.title).join(', ')}${refused.length > 3 ? '…' : ''}`
          : `${changed} paper(s) published.`,
      });
    }
    case 'delete': {
      // Deleting a paper takes its results with it, so the count is reported
      // first and the caller has to come back with `force`.
      if (!ctx.user.isPlatformAdmin && ctx.user.role !== 'owner' && ctx.user.role !== 'admin') {
        return NextResponse.json({
          error: 'Deleting papers is for owners and administrators, because it deletes the results too.',
        }, { status: 403 });
      }
      const counts = await tests.attemptCountsFor(ids);
      const sat = counts.reduce((sum, row) => sum + Number(row.n), 0);
      if (sat > 0 && body.force !== true) {
        return NextResponse.json({
          error: `${sat} candidate attempt(s) would be deleted along with these papers, including the results. `
            + 'Confirm to delete both, or take the papers off the list instead.',
          needsConfirmation: true,
          attempts: sat,
        }, { status: 409 });
      }
      const changed = await tests.bulkRemove(ctx.org.id, ids);
      return NextResponse.json({
        ok: true, changed, deletedAttempts: sat,
        message: `${changed} paper(s) deleted${sat ? ` with ${sat} attempt(s)` : ''}.`,
      });
    }
    default:
      return NextResponse.json({ error: 'That is not an action.' }, { status: 400 });
  }
}
