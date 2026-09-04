'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pill } from '../ui/Shell';
import FolderTree, { onShelf } from './FolderTree';

export interface PaperRow {
  id: string;
  title: string;
  module: string;
  status: string;
  visibility: string;
  priceCredits: number;
  durationMin: number;
  questionCount: number | null;
  hasAudio: number;
  bank: number;
  folder: string | null;
  updatedAt: string;
  attemptCount: number;
}

type Action = 'folder' | 'bank' | 'visibility' | 'publish' | 'unpublish' | 'delete';

const VISIBILITY_LABEL: Record<string, string> = {
  private: 'This organisation',
  catalog: 'Public catalogue',
  sitting: 'Sitting code only',
  suite: 'Inside a full test',
};

/**
 * The papers screen at bank scale.
 *
 * One upload of a book leaves forty papers behind, so the two things this
 * screen has to do are find one paper among hundreds and do the same thing to
 * many at once. Filtering happens here in the browser because the whole list
 * is already loaded as metadata — a few hundred rows of a few hundred bytes —
 * and a round trip per keystroke would be slower than the filter.
 */
export default function PapersManager({
  rows, canDelete,
}: {
  rows: PaperRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  /**
   * Which shelf is open, as a full folder path. A flat list of four hundred
   * papers is unusable however good the search is, and the folders were already
   * there — the screen just was not showing them.
   */
  const [folder, setFolder] = useState<string | null>(null);
  const [module, setModule] = useState('');
  const [state, setState] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const folders = useMemo(
    () => [...new Set(rows.map((r) => r.folder?.trim()).filter(Boolean) as string[])].sort(),
    [rows],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!onShelf(r, folder)) return false;
      if (module && r.module !== module) return false;
      if (state === 'published' && r.status !== 'published') return false;
      if (state === 'draft' && r.status !== 'draft') return false;
      if (state === 'bank' && r.bank !== 1) return false;
      if (state === 'hidden' && r.visibility !== 'suite' && r.visibility !== 'sitting') return false;
      if (state === 'audio' && r.hasAudio !== 1) return false;
      if (!needle) return true;
      return `${r.title} ${r.folder ?? ''} ${r.module}`.toLowerCase().includes(needle);
    });
  }, [rows, query, folder, module, state]);

  const allShownPicked = shown.length > 0 && shown.every((r) => picked.includes(r.id));

  async function run(action: Action, value?: string | boolean, force = false) {
    setBusy(true); setError(null); setMessage(null);
    const res = await fetch('/api/admin/tests/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: picked, action, value, force }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'That could not be done.');
      // Deleting papers that have been sat needs a second, explicit yes.
      if (data.needsConfirmation && window.confirm(`${data.error}\n\nDelete them and their results?`)) {
        await run(action, value, true);
      }
      return;
    }
    setMessage(data.message ?? 'Done.');
    setPicked([]);
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[34px] max-w-[1320px]">
      <div className="flex items-center justify-between mb-[10px]">
        <h1 className="text-[32px] font-semibold">Papers</h1>
        <span className="text-[16px] text-[color:var(--paper-ink-3)]">
          {rows.length} paper{rows.length === 1 ? '' : 's'}
          {rows.filter((r) => r.bank === 1).length > 0 && (
            <> · {rows.filter((r) => r.bank === 1).length} in the bank</>
          )}
        </span>
      </div>

      {/* ------------------------------ finding ---------------------------- */}
      <div className="grid gap-[12px] sm:grid-cols-4 mb-[18px]">
        <label className="block sm:col-span-2">
          <span className="block text-[13px] font-semibold mb-[5px]">Search</span>
          <input
            className="admin-input"
            placeholder="Title, folder, module…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold mb-[5px]">Module</span>
          <select className="admin-input" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Every module</option>
            <option value="reading">Reading</option>
            <option value="listening">Listening</option>
            <option value="writing">Writing</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold mb-[5px]">Showing</span>
          <select className="admin-input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Everything</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
            <option value="bank">In the bank</option>
            <option value="hidden">Hidden from lists</option>
            <option value="audio">With a recording</option>
          </select>
        </label>
      </div>

      <div className="flex gap-[22px] items-start">
      <FolderTree rows={rows} open={folder} onOpen={setFolder} everything="Every paper" />

      <div className="flex-1 min-w-0">
      {error && <p className="text-[16px] text-[color:var(--bad)] mb-[14px]">{error}</p>}
      {message && <p className="text-[16px] text-[color:var(--good)] mb-[14px]">{message}</p>}

      {/* ------------------------------ bulk bar --------------------------- */}
      {picked.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-end gap-[12px] bg-[color:var(--paper)] border border-[color:var(--line)] rounded-[4px] px-[16px] py-[12px] mb-[16px]">
          <span className="text-[16px] font-semibold pb-[10px]">{picked.length} selected</span>
          <label className="block">
            <span className="block text-[13px] font-semibold mb-[5px]">Move to a folder</span>
            <div className="flex gap-[8px]">
              <input className="admin-input" list="paper-folders" value={moveTo} placeholder="Folder name"
                     onChange={(e) => setMoveTo(e.target.value)} />
              <datalist id="paper-folders">
                {folders.map((f) => <option key={f} value={f} />)}
              </datalist>
              <button type="button" disabled={busy} onClick={() => run('folder', moveTo)}
                      className="px-[14px] h-[42px] border border-[color:var(--line-strong)] rounded-[3px] text-[15px] disabled:opacity-50">
                Move
              </button>
            </div>
          </label>
          <div className="flex flex-wrap gap-[8px] pb-[1px]">
            <button type="button" disabled={busy} onClick={() => run('bank', true)} className="p-chip">To the bank</button>
            <button type="button" disabled={busy} onClick={() => run('bank', false)} className="p-chip">Out of the bank</button>
            <button type="button" disabled={busy} onClick={() => run('publish')} className="p-chip">Publish</button>
            <button type="button" disabled={busy} onClick={() => run('unpublish')} className="p-chip">Unpublish</button>
            <button type="button" disabled={busy} onClick={() => run('visibility', 'suite')} className="p-chip">Hide behind a full test</button>
            {canDelete && (
              <button type="button" disabled={busy} onClick={() => run('delete')}
                      className="p-chip text-[color:var(--bad)]">Delete</button>
            )}
            <button type="button" onClick={() => setPicked([])} className="p-chip">Clear</button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">
          {rows.length === 0
            ? <>No papers yet. <Link href="/admin/import" className="underline">Import one</Link>, take some from the{' '}
              <Link href="/admin/library" className="underline">Testora library</Link>, or write one from scratch.</>
            : 'Nothing matches that.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[color:var(--line)]">
                <th className="py-[10px] w-[34px]">
                  <input
                    type="checkbox"
                    checked={allShownPicked}
                    aria-label="Select every paper shown"
                    onChange={(e) => setPicked(e.target.checked
                      ? [...new Set([...picked, ...shown.map((r) => r.id)])]
                      : picked.filter((id) => !shown.some((r) => r.id === id)))}
                  />
                </th>
                <th className="py-[10px] font-semibold">Title</th>
                <th className="py-[10px] font-semibold w-[150px]">Folder</th>
                <th className="py-[10px] font-semibold w-[100px]">Module</th>
                <th className="py-[10px] font-semibold w-[120px]">Status</th>
                <th className="py-[10px] font-semibold w-[190px]">Where it is</th>
                <th className="py-[10px] font-semibold w-[110px]">Questions</th>
                <th className="py-[10px] font-semibold w-[90px]">Sat</th>
                <th className="py-[10px] w-[130px]" />
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} className="border-b border-[color:var(--line)]">
                  <td className="py-[11px]">
                    <input
                      type="checkbox"
                      checked={picked.includes(t.id)}
                      aria-label={`Select ${t.title}`}
                      onChange={() => setPicked((list) => (
                        list.includes(t.id) ? list.filter((id) => id !== t.id) : [...list, t.id]
                      ))}
                    />
                  </td>
                  <td className="py-[11px]">
                    <Link href={`/admin/tests/${t.id}`} className="underline">{t.title}</Link>
                    {t.hasAudio === 1 && (
                      <span className="ml-[8px] text-[14px] text-[color:var(--paper-ink-3)]">recording</span>
                    )}
                  </td>
                  <td className="py-[11px] text-[15px] text-[color:var(--paper-ink-3)]">{t.folder ?? '—'}</td>
                  <td className="py-[11px] capitalize">{t.module}</td>
                  <td className="py-[11px]">
                    <Pill tone={t.status === 'published' ? 'good' : 'neutral'}>{t.status}</Pill>
                  </td>
                  <td className="py-[11px] space-x-[6px]">
                    <span className="text-[15px]">{VISIBILITY_LABEL[t.visibility] ?? t.visibility}</span>
                    {t.bank === 1 && <Pill tone="warn">Bank</Pill>}
                  </td>
                  <td className="py-[11px] tabular-nums">
                    {t.questionCount ?? '—'}
                    <span className="text-[color:var(--paper-ink-3)]">
                      {t.durationMin > 0 ? ` · ${t.durationMin}m` : ' · no limit'}
                    </span>
                  </td>
                  <td className="py-[11px] tabular-nums">{t.attemptCount}</td>
                  <td className="py-[11px] text-right whitespace-nowrap">
                    <Link href={`/admin/preview/${t.id}`} className="underline">Preview</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
