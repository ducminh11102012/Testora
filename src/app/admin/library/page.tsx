import { requireStaff } from '@/lib/context';
import { tests } from '@/lib/db';
import LibraryBrowser, { LibraryFolder } from '@/components/admin/LibraryBrowser';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Testora library' };

export default async function LibraryPage() {
  const { org } = await requireStaff();

  // Only the sources, not the papers: this is a browse, not a read.
  const taken = new Set((await tests.copiedSources(org.id)).map((row) => row.source));

  const grouped = new Map<string, LibraryFolder>();
  for (const row of await tests.library()) {
    const name = row.folder?.trim() || 'Unfiled';
    const folder = grouped.get(name) ?? { name, papers: [] };
    folder.papers.push({
      id: row.id,
      title: row.title,
      module: row.module,
      durationMin: row.durationMin,
      owner: row.ownerName,
      questions: row.questionCount ?? 0,
      listening: row.hasAudio === 1,
      alreadyCopied: taken.has(`library:${row.id}`),
    });
    grouped.set(name, folder);
  }

  return (
    <LibraryBrowser
      folders={[...grouped.values()]}
      total={await tests.libraryCount()}
      bankCount={await tests.bankCount(org.id)}
    />
  );
}
