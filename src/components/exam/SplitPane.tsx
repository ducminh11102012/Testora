'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Two independently scrolling panes separated by a draggable rule, exactly as
 * in the reference: a hairline divider with a small white grab handle centred
 * on it.
 */
export default function SplitPane({
  left, right, storageKey = 'exam.split',
}: {
  left: React.ReactNode; right: React.ReactNode; storageKey?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setRatio(Math.min(0.8, Math.max(0.2, Number(saved))));
    } catch { /* storage can be unavailable */ }
  }, [storageKey]);

  const apply = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = Math.min(0.8, Math.max(0.2, (clientX - rect.left) / rect.width));
    setRatio(next);
    try { window.localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => apply(e.clientX);
    const touch = (e: TouchEvent) => e.touches[0] && apply(e.touches[0].clientX);
    const stop = () => setDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', touch);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', touch);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, apply]);

  return (
    <div ref={wrapRef} className="flex-1 min-h-0 flex relative">
      <div className="exam-scroll min-h-0 pr-[10px]" style={{ width: `${ratio * 100}%` }}>
        {left}
      </div>

      <div className="relative w-0 shrink-0">
        <div
          className="absolute inset-y-0 left-0 w-px"
          style={{ background: 'var(--divider)' }}
          aria-hidden="true"
        />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the reading and question panes"
          tabIndex={0}
          onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
          onTouchStart={() => setDragging(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setRatio((r) => Math.max(0.2, r - 0.03));
            if (e.key === 'ArrowRight') setRatio((r) => Math.min(0.8, r + 0.03));
          }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-0 w-[52px] h-[46px] bg-white border border-[#8f8f8f] flex items-center justify-center cursor-col-resize z-10 focus-ring"
        >
          <svg width="26" height="14" viewBox="0 0 26 14" fill="none" stroke="#1e1e1e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 7h24M6 2.5 1.5 7 6 11.5M20 2.5 24.5 7 20 11.5" />
          </svg>
        </div>
      </div>

      <div className="exam-scroll min-h-0 pl-[24px]" style={{ width: `${(1 - ratio) * 100}%` }}>
        {right}
      </div>
    </div>
  );
}
