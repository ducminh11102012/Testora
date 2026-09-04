import { NextRequest, NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_AT_ONCE = 60;

/**
 * Takes papers out of the Testora library and into this organisation's bank.
 *
 * It really is a copy. Pointing at the library's own row would mean a school's
 * results depended on a paper somebody else can edit or delete, so each paper
 * is duplicated: the copy belongs to the school, who can edit it, publish it,
 * and keep it as long as they like.
 */
export async function POST(req: NextRequest) {
  // Stocking the paper bank is teaching work, like importing a paper.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const wanted = new Set<string>(Array.isArray(body.testIds) ? body.testIds.map(String) : []);
  const folder = body.folder ? String(body.folder) : null;

  const library = await tests.library();
  const chosen = library.filter((row) => (
    wanted.size ? wanted.has(row.id) : folder ? (row.folder?.trim() || 'Unfiled') === folder : false
  ));

  if (!chosen.length) {
    return NextResponse.json({ error: 'Choose a paper, or a folder, to copy.' }, { status: 400 });
  }
  if (chosen.length > MAX_AT_ONCE) {
    return NextResponse.json({
      error: `That is ${chosen.length} papers. Copy up to ${MAX_AT_ONCE} at a time, a folder at a time.`,
    }, { status: 413 });
  }

  // Copying the same paper twice would leave two identical papers in the bank.
  const already = new Set((await tests.copiedSources(ctx.org.id)).map((row) => row.source));

  // The papers themselves are only read for the handful actually being copied.
  const wanted_ids = chosen.filter((row) => !already.has(`library:${row.id}`)).map((row) => row.id);
  const bodies = new Map((await tests.byIds(wanted_ids)).map((row) => [row.id, row.content]));

  const copied: Array<{ id: string; title: string }> = [];
  let skipped = 0;
  for (const row of chosen) {
    if (already.has(`library:${row.id}`)) { skipped += 1; continue; }
    if (!bodies.get(row.id)) { skipped += 1; continue; }
    const made = await tests.create({
      orgId: ctx.org.id,
      title: row.title,
      module: row.module,
      variant: row.variant,
      status: 'published',
      durationMin: row.durationMin,
      content: bodies.get(row.id) ?? '',
      // In the bank, and reached through a full test rather than listed on its
      // own — the same shape as a paper imported from a book.
      bank: true,
      visibility: 'suite',
      folder: row.folder?.trim() || 'Testora library',
      // How the copy is recognised later, so it is never copied twice.
      source: `library:${row.id}`,
    });
    copied.push({ id: made.id, title: made.title });
  }

  return NextResponse.json({
    ok: true,
    copied: copied.length,
    skipped,
    papers: copied,
    message: copied.length
      ? `${copied.length} paper${copied.length === 1 ? '' : 's'} copied into your bank`
        + `${skipped ? `, ${skipped} already there` : ''}.`
      : 'Those papers are already in your bank.',
  });
}
