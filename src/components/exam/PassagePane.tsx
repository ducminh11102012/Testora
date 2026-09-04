'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Annotation, paint, selectionRange } from '@/lib/highlight';
import { asHtml, uid } from '@/lib/utils';
import { HighlighterIcon, QuoteIcon } from '../ui/Icons';

interface Props {
  partId: string;
  title?: string;
  html: string;
  annotations: Annotation[];
  activeId?: string;
  onChange: (next: Annotation[]) => void;
  onOpenNote: (id: string) => void;
}

export default function PassagePane({
  partId, title, html, annotations, activeId, onChange, onOpenNote,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null);

  const mine = annotations.filter((a) => a.partId === partId);

  useLayoutEffect(() => {
    if (ref.current) paint(ref.current, asHtml(html), mine, activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, JSON.stringify(mine.map((a) => [a.id, a.start, a.end, !!a.note])), activeId]);

  const closePopup = useCallback(() => setPopup(null), []);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-selection-popup]')) return;
      closePopup();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [closePopup]);

  function handleMouseUp(e: React.MouseEvent) {
    const root = ref.current;
    if (!root) return;
    const target = e.target as HTMLElement;
    const mark = target.closest('mark[data-ann-id]') as HTMLElement | null;
    const range = selectionRange(root);

    if (!range) {
      if (mark) {
        const id = mark.dataset.annId!;
        onOpenNote(id);
      }
      setPopup(null);
      return;
    }

    const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
    const hostRect = root.getBoundingClientRect();
    setPopup({
      x: rect.left - hostRect.left + rect.width / 2 + root.scrollLeft,
      y: rect.bottom - hostRect.top + root.scrollTop + 10,
      start: range.start,
      end: range.end,
      text: range.text,
    });
  }

  function commit(withNote: boolean) {
    if (!popup) return;
    const ann: Annotation = {
      id: uid('ann'), partId, start: popup.start, end: popup.end,
      text: popup.text, note: withNote ? '' : undefined, createdAt: Date.now(),
    };
    onChange([...annotations, ann]);
    window.getSelection()?.removeAllRanges();
    setPopup(null);
    if (withNote) onOpenNote(ann.id);
  }

  return (
    <div className="relative pl-[22px] pr-[14px] pt-[22px] pb-[60px]">
      {title && <h2 className="text-[21px] font-bold mb-[22px]">{title}</h2>}
      <div
        ref={ref}
        className="exam-body"
        onMouseUp={handleMouseUp}
        // Painted imperatively so annotations survive re-renders untouched.
        suppressHydrationWarning
      />

      {popup && (
        <div
          data-selection-popup
          className="absolute z-30 -translate-x-1/2 bg-white shadow-pop rounded-[4px] border border-[#dcdcdc]"
          style={{ left: popup.x, top: popup.y }}
        >
          <span
            className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-[13px] h-[13px] bg-white border-l border-t border-[#dcdcdc] rotate-45"
            aria-hidden="true"
          />
          <div className="relative flex">
            <PopupButton onClick={() => commit(true)} icon={<QuoteIcon />} label="Note" />
            <PopupButton onClick={() => commit(false)} icon={<HighlighterIcon />} label="Highlight" />
          </div>
        </div>
      )}
    </div>
  );
}

function PopupButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-[86px] py-[10px] flex flex-col items-center gap-[6px] text-[14px] text-[#3d3d3d] hover:bg-[#f4f4f4]"
    >
      <span className="text-[#5e5e5e]">{icon}</span>
      {label}
    </button>
  );
}
