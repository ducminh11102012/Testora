'use client';

import { Shelf, Shelvable, shelve } from '@/lib/folders';

export { LOOSE, SEPARATOR, onShelf, shelve } from '@/lib/folders';
export type { Shelf, Shelvable } from '@/lib/folders';

/**
 * The folder tree, shared by the papers screen and the bank. The shelving
 * itself lives in `src/lib/folders.ts`, so it can be checked without a browser.
 */

function Branch({ shelf, open, onOpen, depth }: {
  shelf: Shelf; open: string | null; onOpen: (path: string | null) => void; depth: number;
}) {
  const active = open === shelf.path;
  return (
    <div>
      <button
        type="button"
        onClick={() => onOpen(active ? null : shelf.path)}
        className={`w-full text-left px-[10px] py-[6px] rounded-[3px] text-[16px] flex justify-between gap-[10px]
                    ${active ? 'bg-[color:var(--paper-raised)] font-semibold' : 'hover:bg-[color:var(--paper-raised)]'}`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
      >
        <span className="truncate">{shelf.name}</span>
        <span className="text-[color:var(--paper-ink-3)] text-[14px] shrink-0">{shelf.count}</span>
      </button>
      {[...shelf.children.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child) => (
          <Branch key={child.path} shelf={child} open={open} onOpen={onOpen} depth={depth + 1} />
        ))}
    </div>
  );
}

export default function FolderTree({ rows, open, onOpen, everything = 'Everything' }: {
  rows: Shelvable[];
  open: string | null;
  onOpen: (path: string | null) => void;
  everything?: string;
}) {
  const { root, total } = shelve(rows);
  return (
    <aside className="w-[260px] shrink-0 p-card p-[10px] self-start sticky top-[16px] max-h-[80vh] overflow-y-auto">
      <button
        type="button"
        onClick={() => onOpen(null)}
        className={`w-full text-left px-[10px] py-[6px] rounded-[3px] text-[16px] flex justify-between
                    ${open === null ? 'bg-[color:var(--paper-raised)] font-semibold' : 'hover:bg-[color:var(--paper-raised)]'}`}
      >
        <span>{everything}</span>
        <span className="text-[color:var(--paper-ink-3)] text-[14px]">{total}</span>
      </button>
      {[...root.children.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((shelf) => <Branch key={shelf.path} shelf={shelf} open={open} onOpen={onOpen} depth={0} />)}
    </aside>
  );
}
