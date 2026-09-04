'use client';

import { BellIcon, MenuIcon, NotesIcon, WifiIcon } from '../ui/Icons';
import BrandMark from '../ui/BrandMark';
import { Branding } from '@/types/db';
import { formatClock } from '@/lib/utils';

export function TimerBar({ remaining, total, untimed = false }: {
  remaining: number; total: number; untimed?: boolean;
}) {
  // A paper without a time limit has nothing to run down, so the rail stays a
  // plain rule rather than pretending to measure something.
  if (untimed) return <div className="shrink-0 h-[14px] bg-white" aria-hidden="true" />;
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 100;
  const warn = remaining <= 600;
  return (
    <div className="shrink-0 px-[8px] pt-[3px] pb-[2px] bg-white">
      <div
        role="progressbar"
        aria-label="Time remaining"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(remaining)}
        title={`${formatClock(remaining)} remaining`}
        className="h-[9px] w-full rounded-full overflow-hidden"
        style={{ background: 'var(--rail-track)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%`, background: warn ? '#F6C6C6' : 'var(--rail)' }}
        />
      </div>
    </div>
  );
}

interface Props {
  branding: Branding;
  testTakerId: string;
  remaining: number;
  /** No time limit: the clock is replaced by a plain note. */
  untimed?: boolean;
  online: boolean;
  notesOpen: boolean;
  menuOpen: boolean;
  onToggleNotes: () => void;
  onToggleMenu: () => void;
  onBell: () => void;
  alerts: number;
}

export default function ExamHeader({
  branding, testTakerId, remaining, untimed = false, online, notesOpen, menuOpen,
  onToggleNotes, onToggleMenu, onBell, alerts,
}: Props) {
  // The clock is always on screen. Colour, not motion, marks the last ten
  // minutes and the last two, so it never pulls the eye off the question.
  const warn = remaining <= 600;
  const urgent = remaining <= 120;

  return (
    <header className="shrink-0">
      <div className="flex items-center justify-between border-b border-[#e4e4e4] px-[22px] h-[104px]">
        <div className="flex items-center gap-[40px]">
          <BrandMark branding={branding} tone="brand" />
          <span className="text-[19px] font-bold">{testTakerId}</span>
        </div>

        <div className="flex items-center gap-[6px]">
          {untimed ? (
            <span
              title="This paper has no time limit. Your answers are saved as you go, so you can come back and finish later."
              className="mr-3 flex items-baseline gap-[8px] px-[14px] h-[44px] rounded-[3px] border"
              style={{ borderColor: 'var(--rule)' }}
            >
              <span className="text-[18px] font-semibold leading-[44px]">No time limit</span>
            </span>
          ) : (
          <span
            role="timer"
            aria-label={`Time remaining: ${Math.floor(remaining / 60)} minutes`}
            title="Time remaining. The paper is handed in for you when it reaches zero."
            className="mr-3 flex items-baseline gap-[8px] px-[14px] h-[44px] rounded-[3px] border tabular-nums"
            style={{
              borderColor: urgent ? 'var(--bad)' : warn ? '#B4801F' : 'var(--rule)',
              background: urgent ? '#FDECEC' : warn ? '#FFF7E6' : 'transparent',
              color: urgent ? 'var(--bad)' : 'inherit',
            }}
          >
            <span className="text-[24px] font-bold leading-[44px]">{formatClock(remaining)}</span>
            <span className="text-[14px] leading-[44px] opacity-70">left</span>
          </span>
          )}

          <IconSlot label={online ? 'Connection: online' : 'Connection: offline'}>
            <span className={online ? '' : 'opacity-40'}><WifiIcon /></span>
          </IconSlot>

          <IconSlot label="Notifications" onClick={onBell} badge={alerts}>
            <BellIcon />
          </IconSlot>

          <IconSlot label="Options menu" onClick={onToggleMenu} boxed={menuOpen}>
            <MenuIcon />
          </IconSlot>

          <IconSlot label="Notes and highlights" onClick={onToggleNotes} boxed={notesOpen}>
            <NotesIcon />
          </IconSlot>
        </div>
      </div>
    </header>
  );
}

function IconSlot({
  children, label, onClick, boxed, badge,
}: {
  children: React.ReactNode; label: string; onClick?: () => void; boxed?: boolean; badge?: number;
}) {
  const className = `relative w-[62px] h-[74px] flex items-center justify-center focus-ring ${
    boxed ? 'border-2 border-black' : 'border-2 border-transparent'
  }`;
  const badgeNode = !!badge && badge > 0 && (
    <span
      className="absolute top-[14px] right-[12px] min-w-[17px] h-[17px] rounded-full text-[11px] font-bold text-white flex items-center justify-center px-[4px]"
      style={{ background: 'var(--brand)' }}
    >
      {badge}
    </span>
  );

  if (!onClick) {
    return (
      <div className={className} aria-label={label} title={label} role="img">
        {children}
        {badgeNode}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={className}>
      {children}
      {badgeNode}
    </button>
  );
}
