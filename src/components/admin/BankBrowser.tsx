'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';
import FolderTree, { onShelf, shelve } from './FolderTree';

export interface BankPaper {
  id: string;
  title: string;
  module: string;
  status: string;
  questionCount: number | null;
  hasAudio: number;
  durationMin: number;
  folder: string | null;
  source: string | null;
  updatedAt: string;
  attemptCount: number;
}

const MODULE_LABEL: Record<string, string> = {
  reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking', mixed: 'Mixed',
};

/**
 * The bank browser.
 *
 * A bank is not a list, it is a shelf: one upload of a book leaves forty papers
 * behind, and the question is never "which of these four hundred rows" but
 * "what have we got, and where". So the folders come first and carry their own
 * counts, and the rows are what is inside the shelf you opened.
 */
export default function BankBrowser({
  papers, assembled, canDelete, orgName, otherPapers,
}: {
  papers: BankPaper[];
  /** Full tests that were built out of the bank. */
  assembled: number;
  canDelete: boolean;
  /** Whose bank this is, so a wrong organisation is visible rather than empty. */
  orgName: string;
  /** Papers this organisation has that are *not* in the bank. */
  otherPapers: number;
}) {
  const router = useRouter();

  /*
   * Ask the server again on arrival. A book import fills the bank in the
   * background, so the copy of this screen the router may have fetched a
   * minute ago is exactly the one that is wrong.
   */
  useEffect(() => { router.refresh(); }, [router]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => shelve(papers).root, [papers]);
  const folders = useMemo(
    () => [...new Set(papers.map((p) => p.folder?.trim()).filter(Boolean) as string[])].sort(),
    [papers],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return papers.filter((p) => {
      if (!onShelf(p, open)) return false;
      if (!needle) return true;
      return `${p.title} ${p.folder ?? ''} ${p.module}`.toLowerCase().includes(needle);
    });
  }, [papers, open, query]);

  const modules = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of papers) counts.set(p.module, (counts.get(p.module) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [papers]);

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  async function act(action: 'folder' | 'bank' | 'delete', value?: string | boolean) {
    if (!picked.length) return;
    if (action === 'delete' && !window.confirm(
      `Delete ${picked.length} paper(s) from the bank? Results already recorded against them are deleted too.`,
    )) return;
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch('/api/admin/tests/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: picked, action, value, force: action === 'delete' ? 1 : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'That did not work.'); return; }
    setMessage(data.message ?? 'Done.');
    setPicked([]);
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1320px]">
      <div className="flex items-baseline justify-between gap-[16px] mb-[6px]">
        <h1 className="text-[32px] font-normal">Bank<span className="text-[18px] text-[color:var(--paper-ink-3)]"> · {orgName}</span></h1>
        <button type="button" onClick={() => router.refresh()} className="p-chip">Refresh</button>
      </div>
      <p className="text-[17px] text-[color:var(--paper-ink-2)] mb-[22px] max-w-[76ch]">
        Every paper in your bank, on its shelves. Bank papers stay out of the paper list candidates
        scroll through: a full test is built from them — by hand, or drawn at random — and that is
        how a candidate reaches one. Papers imported from a book file themselves here by what they
        turned out to be.
      </p>

      <div className="flex flex-wrap gap-[10px] mb-[20px] text-[16px]">
        <Pill>{papers.length} paper(s)</Pill>
        <Pill>{tree.children.size} folder(s)</Pill>
        {modules.map(([m, n]) => <Pill key={m}>{MODULE_LABEL[m] ?? m}: {n}</Pill>)}
        {assembled > 0 && <Pill tone="good">{assembled} full test(s) built from it</Pill>}
      </div>

      {!papers.length ? (
        <div className="p-card p-[22px] text-[17px] leading-[1.6]">
          {otherPapers > 0 ? (
            <>
              Nothing in the bank of <b>{orgName}</b> — though this organisation has{' '}
              <Link href="/admin/tests" className="underline">{otherPapers} paper(s)</Link> outside it.
              A paper goes in the bank when the import had <i>&ldquo;put it in the bank&rdquo;</i>{' '}
              ticked (a book always does), or when you select papers in{' '}
              <Link href="/admin/tests" className="underline">Papers</Link> and choose{' '}
              <i>To the bank</i>. If an import has only just finished, press <i>Refresh</i> above.
            </>
          ) : (
            <>
              Nothing in the bank yet. <Link href="/admin/import" className="underline">Upload a book</Link>{' '}
              — tick <i>&ldquo;this upload is a whole book&rdquo;</i> and it arrives as one paper per test or
              per exercise, filed by type — or take papers from the{' '}
              <Link href="/admin/library" className="underline">Testora library</Link>.
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-[24px] items-start">
          <FolderTree rows={papers} open={open} onOpen={setOpen} everything="Everything in the bank" />

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-[12px] items-end mb-[14px]">
              <label className="block flex-1 min-w-[240px]">
                <span className="block text-[14px] font-semibold mb-[6px]">Search this bank</span>
                <input
                  className="admin-input" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Title, folder, module…"
                />
              </label>
              <Link href="/admin/suites" className="underline text-[16px] pb-[12px]">
                Build a full test from the bank
              </Link>
            </div>

            {picked.length > 0 && (
              <div className="p-card p-[14px] mb-[14px] flex flex-wrap gap-[10px] items-end">
                <span className="text-[16px] pb-[12px]">{picked.length} selected</span>
                <label className="block">
                  <span className="block text-[14px] font-semibold mb-[6px]">Move to folder</span>
                  <input
                    className="admin-input" list="bank-folders" value={moveTo}
                    onChange={(e) => setMoveTo(e.target.value)} placeholder="Folder name"
                  />
                  <datalist id="bank-folders">
                    {folders.map((f) => <option key={f} value={f} />)}
                  </datalist>
                </label>
                <button type="button" disabled={busy} onClick={() => act('folder', moveTo.trim())}
                        className="p-chip h-[44px] px-[18px]">Move</button>
                <button type="button" disabled={busy} onClick={() => act('bank', false)}
                        className="p-chip h-[44px] px-[18px]">Take out of the bank</button>
                {canDelete && (
                  <button type="button" disabled={busy} onClick={() => act('delete')}
                          className="p-chip h-[44px] px-[18px] text-[color:var(--bad)]">Delete</button>
                )}
              </div>
            )}

            {message && <div className="insp-notice mb-[14px]" role="status">{message}</div>}
            {error && <div className="insp-notice insp-notice--warn mb-[14px]" role="alert">{error}</div>}

            <table className="w-full text-[16px] border-collapse">
              <thead>
                <tr className="text-left text-[14px] text-[color:var(--paper-ink-3)] border-b border-[color:var(--line)]">
                  <th className="w-[34px] py-[8px]"></th>
                  <th className="py-[8px]">Paper</th>
                  <th className="py-[8px] w-[130px]">Module</th>
                  <th className="py-[8px] w-[110px]">Questions</th>
                  <th className="py-[8px] w-[90px]">Sat</th>
                  <th className="py-[8px] w-[120px]">State</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-b border-[color:var(--line)] align-top">
                    <td className="py-[10px]">
                      <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td className="py-[10px]">
                      <Link href={`/admin/tests/${p.id}`} className="underline">{p.title}</Link>
                      <span className="block text-[14px] text-[color:var(--paper-ink-3)]">
                        {p.folder ?? 'Not in a folder'}
                        {p.hasAudio ? ' · has a recording' : ''}
                      </span>
                    </td>
                    <td className="py-[10px]">{MODULE_LABEL[p.module] ?? p.module}</td>
                    <td className="py-[10px]">{p.questionCount ?? '—'}</td>
                    <td className="py-[10px]">{p.attemptCount}</td>
                    <td className="py-[10px]">
                      {p.status === 'published'
                        ? <Pill tone="good">Ready</Pill>
                        : <Pill tone="warn">Draft</Pill>}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr><td colSpan={6} className="py-[18px] text-[color:var(--paper-ink-3)]">
                    Nothing on this shelf matches.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
