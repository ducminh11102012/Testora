import { NextResponse } from 'next/server';
import { tests } from '@/lib/db';
import { isResponse, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The Testora library: papers the platform has opened to every organisation.
 * Listed in folders, because a library is browsed rather than scrolled.
 */
export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  // A paper already copied here is shown as taken, so nobody copies it twice.
  const taken = new Set((await tests.copiedSources(ctx.org.id)).map((row) => row.source));

  const folders = new Map<string, Array<Record<string, unknown>>>();
  for (const row of await tests.library()) {
    const folder = row.folder?.trim() || 'Unfiled';
    const list = folders.get(folder) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      module: row.module,
      durationMin: row.durationMin,
      owner: row.ownerName,
      questions: row.questionCount ?? 0,
      listening: row.hasAudio === 1,
      alreadyCopied: taken.has(`library:${row.id}`),
    });
    folders.set(folder, list);
  }

  return NextResponse.json({
    folders: [...folders.entries()].map(([name, papers]) => ({ name, papers })),
    total: await tests.libraryCount(),
  });
}
