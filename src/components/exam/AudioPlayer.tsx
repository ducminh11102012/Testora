'use client';

import { useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '../ui/Icons';
import { formatClock } from '@/lib/utils';

/**
 * Listening player. In `playOnce` mode the recording behaves like the real
 * exam: it starts automatically, cannot be paused, rewound or replayed.
 */
export default function AudioPlayer({ src, playOnce = true }: { src: string; playOnce?: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, []);

  async function start() {
    const el = ref.current;
    if (!el) return;
    try { await el.play(); setPlaying(true); setStarted(true); } catch { /* blocked by autoplay policy */ }
  }

  return (
    <div className="border border-[#d8d8d8] rounded-[3px] px-[18px] py-[14px] mb-[26px] flex items-center gap-[16px]">
      <audio ref={ref} src={src} preload="auto" />
      {playOnce ? (
        <button
          type="button"
          onClick={start}
          disabled={started}
          className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-white disabled:opacity-45"
          style={{ background: 'var(--brand)' }}
          aria-label="Start the recording"
        >
          <PlayIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            const el = ref.current!;
            if (playing) { el.pause(); setPlaying(false); } else { void el.play(); setPlaying(true); }
          }}
          className="w-[48px] h-[48px] rounded-full flex items-center justify-center text-white"
          style={{ background: 'var(--brand)' }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      )}

      <div className="flex-1">
        <div className="h-[6px] rounded-full bg-[#e6e6e6] overflow-hidden">
          <div
            className="h-full"
            style={{ width: duration ? `${(time / duration) * 100}%` : '0%', background: 'var(--rail)' }}
          />
        </div>
        <p className="text-[14px] text-[#5e5e5e] mt-[6px]">
          {playOnce
            ? started ? 'The recording is playing. It will not be repeated.' : 'Press play to start. The recording plays once only.'
            : `${formatClock(time)} / ${formatClock(duration)}`}
        </p>
      </div>
    </div>
  );
}
