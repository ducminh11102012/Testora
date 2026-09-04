/**
 * The shelves.
 *
 * A folder is stored as one string on the paper and " / " is the level
 * separator, so "Cambridge 18 / Reading — Multiple choice" is a folder inside a
 * folder without a table of folders to keep in step with the papers in them.
 * The tree is built from whatever the rows say, which means it is never stale
 * and never holds an empty folder.
 */

export const SEPARATOR = ' / ';

/** Rows only need a folder to be shelved. */
export interface Shelvable { folder: string | null }

export interface Shelf {
  name: string;
  /** The full path, which is what filtering matches on. */
  path: string;
  count: number;
  children: Map<string, Shelf>;
}

export const LOOSE = 'Not in a folder';

export function shelve(rows: Shelvable[]): { root: Shelf; total: number } {
  const root: Shelf = { name: '', path: '', count: 0, children: new Map() };
  for (const row of rows) {
    root.count += 1;
    const path = (row.folder ?? '').trim();
    const parts = path ? path.split(SEPARATOR).map((s) => s.trim()).filter(Boolean) : [LOOSE];
    let node = root;
    let sofar = '';
    for (const part of parts) {
      sofar = sofar ? `${sofar}${SEPARATOR}${part}` : part;
      const next = node.children.get(part) ?? { name: part, path: sofar, count: 0, children: new Map() };
      next.count += 1;
      node.children.set(part, next);
      node = next;
    }
  }
  return { root, total: root.count };
}

/** True when a row belongs on the open shelf, or on one inside it. */
export function onShelf(row: Shelvable, open: string | null): boolean {
  if (!open) return true;
  const path = (row.folder ?? '').trim() || LOOSE;
  return path === open || path.startsWith(`${open}${SEPARATOR}`);
}
