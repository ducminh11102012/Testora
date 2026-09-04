/**
 * Offset-based text annotation.
 *
 * Highlights are stored as plain-text character offsets into a passage rather
 * than as HTML, so they survive re-renders, font-size changes and round trips
 * through the database, and they can be re-applied to the pristine markup at
 * any time.
 */

export interface Annotation {
  id: string;
  partId: string;
  start: number;
  end: number;
  text: string;
  note?: string;
  createdAt: number;
}

function textNodesOf(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[data-no-annotate]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Character offset of a (node, offset) pair within `root`. */
export function offsetOf(root: HTMLElement, node: Node, offset: number): number | null {
  let total = 0;
  for (const t of textNodesOf(root)) {
    if (t === node) return total + offset;
    total += t.data.length;
  }
  // Selection anchored on an element: fall back to the nearest text node.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const child = el.childNodes[offset] ?? el.lastChild;
    if (child && child.nodeType === Node.TEXT_NODE) return offsetOf(root, child, 0);
  }
  return null;
}

export function selectionRange(root: HTMLElement): { start: number; end: number; text: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start === null || end === null || start === end) return null;
  const text = sel.toString();
  return { start: Math.min(start, end), end: Math.max(start, end), text };
}

/** Rewrites `root` from `originalHtml` and paints every annotation onto it. */
export function paint(root: HTMLElement, originalHtml: string, annotations: Annotation[], activeId?: string) {
  root.innerHTML = originalHtml;

  for (const ann of [...annotations].sort((a, b) => a.start - b.start)) {
    // Wrap one overlapping text node at a time, re-walking after each mutation,
    // until the whole span is covered. Spans that cross element boundaries end
    // up as several <mark> fragments sharing the same annotation id.
    for (let guard = 0; guard < 200; guard++) {
      let cursor = 0;
      let wrapped = false;

      for (const node of textNodesOf(root)) {
        const nodeStart = cursor;
        const nodeEnd = cursor + node.data.length;
        cursor = nodeEnd;

        if (nodeEnd <= ann.start || nodeStart >= ann.end) continue;
        if (node.parentElement?.closest(`mark[data-ann-id="${ann.id}"]`)) continue;

        const from = Math.max(0, ann.start - nodeStart);
        const to = Math.min(node.data.length, ann.end - nodeStart);
        if (to <= from) continue;

        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);

        const mark = document.createElement('mark');
        mark.className = 'exam-hl';
        mark.dataset.annId = ann.id;
        if (ann.note) mark.dataset.note = 'true';
        if (activeId === ann.id) mark.dataset.active = 'true';

        try {
          range.surroundContents(mark);
          wrapped = true;
        } catch {
          // A fragment that straddles elements cannot be wrapped directly; the
          // remaining text nodes are handled on the next pass.
        }
        break;
      }

      if (!wrapped) break;
    }
  }
}
