import { requireStaff } from '@/lib/context';
import { suites, tests } from '@/lib/db';
import BankBrowser, { BankPaper } from '@/components/admin/BankBrowser';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bank' };

/**
 * The bank, as its own screen.
 *
 * The papers list answers "where is that paper I made last Tuesday". The bank
 * answers a different question — "what have we actually got?" — and after one
 * upload of a book that is four hundred papers in thirty folders. So this
 * screen leads with the shelves rather than the rows.
 */
export default async function BankPage() {
  const { org, user } = await requireStaff();

  const rows = await tests.bankMeta(org.id);
  const papers: BankPaper[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    module: t.module,
    status: t.status,
    questionCount: t.questionCount,
    hasAudio: t.hasAudio,
    durationMin: t.durationMin,
    folder: t.folder,
    source: t.source,
    updatedAt: t.updatedAt,
    attemptCount: Number(t.attemptCount) || 0,
  }));

  // How many full tests were built out of the bank, which is what a bank is for.
  const assembled = (await suites.listOrg(org.id)).filter((s) => !!s.assembledFor).length;
  /*
   * Papers this organisation has that are not in the bank. An empty bank next
   * to "you have 126 papers" is a different message from an empty bank next to
   * nothing at all — the first tells the operator where to look.
   */
  const outside = await tests.count(org.id) - papers.length;

  return (
    <BankBrowser
      papers={papers}
      orgName={org.name}
      otherPapers={Math.max(0, outside)}
      assembled={assembled}
      canDelete={user.role === 'owner' || user.role === 'admin' || !!user.isPlatformAdmin}
    />
  );
}
