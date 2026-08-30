'use client';

import { useEffect, useRef } from 'react';
import { Annotation } from '@/lib/highlight';
import { CloseIcon } from '../ui/Icons';

export default function NotesPanel({
  annotations, activeId, onClose, onChangeNote, onDelete, onSelect,
}: {
  annotations: Annotation[];
  activeId?: string;
  onClose: () => void;
  onChangeNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const activeRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (activeId) activeRef.current?.focus(); }, [activeId]);

  const sorted = [...annotations].sort((a, b) => a.start - b.start);

  return (
    <aside
      className="w-[430px] shrink-0 border-l border-[#d8d8d8] flex flex-col bg-white"
      aria-label="Notes and highlights"
    >
      <div className="h-[104px] flex items-center justify-between px-[22px] border-b border-[#d8d8d8]">
        <h2 className="text-[21px]">Notes</h2>
        <button type="button" onClick={onClose} aria-label="Close notes" className="focus-ring">
          <CloseIcon size={26} />
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-[40px]">
          <p className="text-[26px] font-semibold leading-snug mb-[28px]">
            Your private notes will show here
          </p>
          <p className="text-[19px] text-[#3d3d3d]">Select text to highlight or create a note.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto exam-scroll p-[18px] space-y-[16px] bg-[#f7f7f7]">
          {sorted.map((a) => (
            <div
              key={a.id}
              className={`bg-white border rounded-[3px] p-[14px] ${a.id === activeId ? 'border-black border-2' : 'border-[#dcdcdc]'}`}
              onClick={() => onSelect(a.id)}
            >
              <p className="text-[15px] leading-snug mb-[10px]">
                <span style={{ background: 'var(--highlight)' }}>“{a.text.slice(0, 160)}{a.text.length > 160 ? '…' : ''}”</span>
              </p>
              {a.note !== undefined && (
                <textarea
                  ref={a.id === activeId ? activeRef : undefined}
                  value={a.note}
                  placeholder="Write a note…"
                  onChange={(e) => onChangeNote(a.id, e.target.value)}
                  className="exam-input w-full min-h-[72px] text-[15px] resize-y"
                />
              )}
              <div className="flex justify-end gap-[14px] mt-[8px]">
                {a.note === undefined && (
                  <button type="button" className="text-[14px] underline" onClick={() => onChangeNote(a.id, '')}>
                    Add note
                  </button>
                )}
                <button type="button" className="text-[14px] underline text-[#c4142e]" onClick={() => onDelete(a.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
