'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';

export interface LibraryPaper {
  id: string;
  title: string;
  module: string;
  durationMin: number;
  owner: string;
  questions: number;
  listening: boolean;
  alreadyCopied: boolean;
}

export interface LibraryFolder {
  name: string;
  papers: LibraryPaper[];
}

/**
 * The shared Testora library, browsed as folders.
 *
 * Copying is deliberate rather than automatic: the copy belongs to this
 * organisation, so it can be edited, published and kept — and a paper being
 * withdrawn from the library later cannot take a school's results with it.
 */
export default function LibraryBrowser({
  folders, total, bankCount,
}: {
  folders: LibraryFolder[];
  total: number;
  bankCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string[]>(folders.slice(0, 1).map((f) => f.name));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleFolder = (name: string) =>
    setOpen((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));

  const togglePaper = (id: string) =>
    setPicked((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));

  async function copy(body: { testIds?: string[]; folder?: string }) {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch('/api/admin/library/copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error ?? 'Those papers could not be copied.'); return; }
    setMessage(data.message);
    setPicked([]);
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1200px]">
      <h1 className="text-[32px] font-semibold mb-[8px]">Testora library</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px] max-w-[80ch]">
        {total} paper{total === 1 ? '' : 's'} shared with every organisation on the platform. Copy
        what you want into your own bank — the copy is yours to edit and publish, and full tests can
        be built out of it at random alongside your own papers. Your bank currently holds{' '}
        {bankCount} paper{bankCount === 1 ? '' : 's'}.
      </p>

      {error && <p className="text-[16px] text-[color:var(--bad)] mb-[16px]">{error}</p>}
      {message && <p className="text-[16px] text-[color:var(--good)] mb-[16px]">{message}</p>}

      {picked.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-[16px] bg-[color:var(--paper)] border border-[color:var(--line)] rounded-[4px] px-[18px] py-[12px] mb-[18px]">
          <span className="text-[16px]">{picked.length} selected</span>
          <button type="button" onClick={() => copy({ testIds: picked })} disabled={busy}
                  className="px-[18px] h-[42px] text-white rounded-[4px] text-[16px] disabled:opacity-60"
                  style={{ background: 'var(--brand)' }}>
            {busy ? 'Copying…' : 'Copy into my bank'}
          </button>
          <button type="button" onClick={() => setPicked([])} className="underline text-[15px]">Clear</button>
        </div>
      )}

      {folders.length === 0 ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">
          The library is empty. A platform administrator fills it by ticking “share with every
          organisation” on a paper.
        </p>
      ) : folders.map((folder) => {
        const isOpen = open.includes(folder.name);
        const remaining = folder.papers.filter((p) => !p.alreadyCopied).length;
        return (
          <section key={folder.name} className="border border-[color:var(--line)] rounded-[6px] mb-[14px]">
            <div className="flex items-center gap-[14px] px-[20px] py-[14px]">
              <button type="button" onClick={() => toggleFolder(folder.name)} aria-expanded={isOpen}
                      className="flex items-center gap-[12px] text-left flex-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                     style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className="text-[19px] font-semibold">{folder.name}</span>
                <Pill tone="neutral">{folder.papers.length}</Pill>
              </button>
              {remaining > 0 && (
                <button type="button" onClick={() => copy({ folder: folder.name })} disabled={busy}
                        className="text-[15px] underline whitespace-nowrap">
                  Copy the whole folder
                </button>
              )}
            </div>

            {isOpen && (
              <ul className="list-none m-0 p-0 border-t border-[color:var(--line)]">
                {folder.papers.map((paper) => (
                  <li key={paper.id} className="border-b border-[color:var(--line)] last:border-b-0">
                    <label className="flex items-center gap-[14px] px-[20px] py-[12px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={picked.includes(paper.id)}
                        disabled={paper.alreadyCopied}
                        onChange={() => togglePaper(paper.id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[17px]">{paper.title}</span>
                        <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                          {paper.owner} · {paper.module}
                          {paper.questions > 0 ? ` · ${paper.questions} questions` : ''}
                          {paper.durationMin > 0 ? ` · ${paper.durationMin} min` : ' · no time limit'}
                          {paper.listening ? ' · recording included' : ''}
                        </span>
                      </span>
                      {paper.alreadyCopied && <Pill tone="good">In your bank</Pill>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
