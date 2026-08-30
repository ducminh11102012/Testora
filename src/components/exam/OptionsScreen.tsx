'use client';

import { useState } from 'react';
import { ChevronRight, CloseIcon, ContrastIcon, SendIcon, TextSizeIcon } from '../ui/Icons';

type View = 'root' | 'contrast' | 'textsize';

const CONTRASTS: { id: string; label: string; bg: string; fg: string }[] = [
  { id: 'default', label: 'Standard', bg: '#ffffff', fg: '#1e1e1e' },
  { id: 'black-yellow', label: 'Black background, yellow text', bg: '#000000', fg: '#ffff00' },
  { id: 'yellow-black', label: 'Yellow background, black text', bg: '#ffff00', fg: '#000000' },
  { id: 'blue-white', label: 'Blue background, white text', bg: '#12305c', fg: '#ffffff' },
  { id: 'white-blue', label: 'White background, blue text', bg: '#ffffff', fg: '#12305c' },
];

const SIZES = [
  { id: 'small', label: 'Small', px: 16 },
  { id: 'medium', label: 'Standard', px: 18 },
  { id: 'large', label: 'Large', px: 21 },
  { id: 'xlarge', label: 'Extra large', px: 24 },
];

export default function OptionsScreen({
  onClose, onSubmitPage, contrast, textSize, onContrast, onTextSize,
}: {
  onClose: () => void;
  onSubmitPage: () => void;
  contrast: string;
  textSize: string;
  onContrast: (v: string) => void;
  onTextSize: (v: string) => void;
}) {
  const [view, setView] = useState<View>('root');

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Options">
      <div className="px-[8px] pt-[3px]">
        <div className="h-[9px] w-full rounded-full" style={{ background: 'var(--rail-track)' }} />
      </div>

      <div className="relative max-w-[1099px] mx-auto px-[24px]">
        <button
          type="button"
          onClick={view === 'root' ? onClose : () => setView('root')}
          aria-label={view === 'root' ? 'Close options' : 'Back'}
          className="fixed right-[52px] top-[42px] focus-ring"
        >
          <CloseIcon />
        </button>

        <h1 className="text-[38px] font-semibold text-center pt-[34px] pb-[36px]">
          {view === 'root' ? 'Options' : view === 'contrast' ? 'Contrast' : 'Text size'}
        </h1>

        {view === 'root' && (
          <div className="space-y-[26px] pb-[60px]">
            <button
              type="button"
              onClick={onSubmitPage}
              className="w-full flex items-center gap-[26px] px-[26px] h-[112px] text-white text-[26px] rounded-[3px] focus-ring"
              style={{ background: 'var(--brand)' }}
            >
              <SendIcon size={30} />
              <span className="flex-1 text-left">Go to submission page</span>
              <ChevronRight size={26} />
            </button>

            <div className="border border-[#e3e3e3] rounded-[3px]">
              <Row icon={<ContrastIcon size={26} />} label="Contrast" onClick={() => setView('contrast')} />
              <div className="h-px bg-[#c1c1c1] mx-[0px]" />
              <Row icon={<TextSizeIcon size={26} />} label="Text size" onClick={() => setView('textsize')} />
            </div>
          </div>
        )}

        {view === 'contrast' && (
          <div className="grid gap-[18px] pb-[60px]">
            {CONTRASTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onContrast(c.id)}
                className={`flex items-center gap-[22px] px-[26px] h-[92px] border rounded-[3px] text-[22px] focus-ring ${
                  contrast === c.id ? 'border-black border-2' : 'border-[#c1c1c1]'
                }`}
              >
                <span
                  className="w-[54px] h-[54px] rounded-[3px] border border-[#9a9a9a] flex items-center justify-center font-bold"
                  style={{ background: c.bg, color: c.fg }}
                >
                  Aa
                </span>
                <span className="flex-1 text-left">{c.label}</span>
                {contrast === c.id && <span className="text-[17px] font-semibold">Selected</span>}
              </button>
            ))}
          </div>
        )}

        {view === 'textsize' && (
          <div className="grid gap-[18px] pb-[60px]">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onTextSize(s.id)}
                className={`flex items-center gap-[22px] px-[26px] h-[92px] border rounded-[3px] focus-ring ${
                  textSize === s.id ? 'border-black border-2' : 'border-[#c1c1c1]'
                }`}
              >
                <span style={{ fontSize: s.px }} className="w-[70px] text-left">Aa</span>
                <span className="flex-1 text-left text-[22px]">{s.label}</span>
                {textSize === s.id && <span className="text-[17px] font-semibold">Selected</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-[26px] px-[26px] h-[112px] text-[26px] focus-ring"
    >
      <span className="text-[#8a8a8a]">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight size={26} />
    </button>
  );
}
