'use client';

import { useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '../ui/Icons';
import { formatClock } from '@/lib/utils';

/**
 * The recording for a listening part.
 *
 * In an examination the tape runs once, from beginning to end, while candidates
 * answer — so there is no seeking, no pausing and no replay: the only control is
 * Play, and once it has been pressed the recording carries on in the background
 * whatever the candidate does with the questions. Any attempt to seek (a media
 * key, a headset button, the browser's own UI) is undone.
 */
export default function AudioPlayer({
  src, playOnce = true, autoStart = false, resumeFrom = 0, note, onEnded,
}: {
  src: string;
  playOnce?: boolean;
  /** Start as soon as the element is ready — used after the candidate has agreed. */
  autoStart?: boolean;
  /**
   * Seconds to jump to before playing. A candidate who reloads the page must
   * not get the tape back from the beginning: the recording has been running
   * since they started it, so it resumes where it would be by now — and if it
   * would have finished, it stays finished.
   */
  resumeFrom?: number;
  /** A line about what the recording covers, e.g. all four parts of a paper. */
  note?: string;
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const furthest = useRef(0);
  /**
   * True once the tape has run out. Kept in a ref as well as in state because
   * the autoplay effect runs in the same commit as the metadata handler, and
   * would otherwise start a spent recording again from the beginning.
   */
  const spent = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onTime = () => {
      setTime(el.currentTime);
      if (el.currentTime > furthest.current) furthest.current = el.currentTime;
    };
    const onMeta = () => {
      setDuration(el.duration || 0);
      // Put the tape where it would be by now. A reload does not rewind it.
      if (resumeFrom > 0 && furthest.current === 0) {
        if (el.duration && resumeFrom >= el.duration - 0.5) {
          furthest.current = el.duration;
          spent.current = true;
          setTime(el.duration);
          setFinished(true);
          setStarted(true);
          return;
        }
        el.currentTime = resumeFrom;
        furthest.current = resumeFrom;
        setTime(resumeFrom);
      }
    };
    const onEnd = () => { spent.current = true; setPlaying(false); setFinished(true); onEnded?.(); };
    // Winding back is the one thing a candidate must not be able to do.
    const onSeeking = () => {
      if (!playOnce) return;
      if (Math.abs(el.currentTime - furthest.current) > 1.5) el.currentTime = furthest.current;
    };
    const onPause = () => {
      if (!playOnce || finished || !started) return;
      // The tape does not stop. Anything that pauses it starts it again.
      void el.play().catch(() => undefined);
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    // A cached file can be ready before this effect runs, in which case
    // `loadedmetadata` has already fired and nothing would put the tape back
    // where it belongs — which is exactly the case after a reload.
    if (el.readyState >= 1) onMeta();
    el.addEventListener('ended', onEnd);
    el.addEventListener('seeking', onSeeking);
    el.addEventListener('pause', onPause);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('seeking', onSeeking);
      el.removeEventListener('pause', onPause);
    };
  }, [playOnce, finished, started, resumeFrom, onEnded]);

  async function start() {
    const el = ref.current;
    // A recording that has already run its length is not played again.
    if (!el || spent.current) return;
    try { await el.play(); setPlaying(true); setStarted(true); } catch { /* blocked by autoplay policy */ }
  }

  useEffect(() => {
    if (autoStart && !started && !finished) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, finished]);

  return (
    <div className="border border-[#d8d8d8] rounded-[3px] px-[18px] py-[14px] mb-[26px] flex items-center gap-[16px]">
      {/* No `controls`: the browser's own bar would offer seeking. */}
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
            className="h-full transition-[width] duration-1000 ease-linear"
            style={{ width: duration ? `${(time / duration) * 100}%` : '0%', background: 'var(--rail)' }}
          />
        </div>
        <p className="text-[14px] text-[#5e5e5e] mt-[6px]">
          {note ? `${note} ` : ''}
          {playOnce
            ? finished
              ? 'The recording has finished. Check your answers before you hand in.'
              : started
                ? `The recording is playing — ${formatClock(Math.max(0, duration - time))} left. It cannot be paused or repeated.`
                : 'Press play to start. The recording plays once only.'
            : `${formatClock(time)} / ${formatClock(duration)}`}
        </p>
      </div>
    </div>
  );
}
