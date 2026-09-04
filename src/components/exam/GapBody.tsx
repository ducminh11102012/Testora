'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { asHtml } from '@/lib/utils';

/**
 * Renders a block of authored HTML containing `[[n]]` gap markers, mounting a
 * real input at each marker's position. Portals are used so the surrounding
 * markup (tables, lists, flow-chart boxes) is preserved exactly.
 *
 * The markup is written imperatively rather than through
 * `dangerouslySetInnerHTML`: React must not own these nodes, or a later render
 * would replace the very elements the portals are anchored to.
 */
export default function GapBody({
  html, renderGap, className = 'exam-body',
}: {
  html: string;
  renderGap: (n: number) => React.ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<{ n: number; el: HTMLElement }[]>([]);

  const prepared = useMemo(
    // A block that arrives as plain text keeps its line breaks.
    () => asHtml(html).replace(/\[\[(\d{1,3})\]\]/g, (_m, n) => `<span data-gap="${n}"></span>`),
    [html],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = prepared;
    setSlots(
      Array.from(host.querySelectorAll<HTMLElement>('[data-gap]'))
        .map((el) => ({ n: Number(el.dataset.gap), el }))
        .filter((s) => Number.isFinite(s.n)),
    );
  }, [prepared]);

  return (
    <>
      <div ref={hostRef} className={className} data-no-annotate suppressHydrationWarning />
      {slots.map(({ n, el }) => createPortal(renderGap(n), el, `gap-${n}`))}
    </>
  );
}
