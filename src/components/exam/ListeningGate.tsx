'use client';

import { useState } from 'react';

/**
 * The announcement an invigilator makes before the tape goes on. Nobody should
 * discover the rules by losing the first question to them, so the candidate
 * reads them and presses Play when they are ready — and only then does the
 * recording, and the section, begin.
 */
export default function ListeningGate({
  partTitle, questionCount, partCount = 1, partNames, onStart,
}: {
  partTitle: string;
  questionCount: number;
  /** How many parts this one recording covers. */
  partCount?: number;
  /** Their names, when the tape runs across more than one. */
  partNames?: string[];
  onStart: () => void;
}) {
  const [starting, setStarting] = useState(false);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-[24px]" style={{ background: 'rgba(255,255,255,0.97)' }}>
      <div className="max-w-[620px] w-full border border-[color:var(--line)] rounded-[6px] px-[34px] py-[32px] bg-white">
        <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[color:var(--paper-ink-3)] mb-[10px]">
          Listening
        </p>
        <h1 className="text-[30px] font-semibold mb-[16px]">{partTitle}</h1>

        <ul className="text-[18px] leading-[1.7] space-y-[10px] mb-[26px] list-disc pl-[24px]">
          <li>The recording plays <strong>once, from beginning to end</strong>.</li>
          <li>You <strong>cannot pause it, stop it or wind it back</strong>.</li>
          {partNames && partNames.length > 1 ? (
            <li>
              One recording covers <strong>all {partCount} parts</strong> ({partNames.join(', ')}).
              It does not stop between them, so move on with the tape.
            </li>
          ) : (
            <li>It keeps playing while you answer, so write as you listen.</li>
          )}
          <li>
            There {questionCount === 1 ? 'is 1 question' : `are ${questionCount} questions`}{' '}
            {partNames && partNames.length > 1 ? 'in the listening paper' : 'in this section'}.
          </li>
          <li>Put your headphones on and check the volume before you start.</li>
        </ul>

        <button
          type="button"
          disabled={starting}
          onClick={() => { setStarting(true); onStart(); }}
          className="px-[26px] h-[52px] text-white rounded-[4px] text-[18px] disabled:opacity-60"
          style={{ background: 'var(--brand)' }}
        >
          {starting ? 'Starting…' : 'Play the recording and begin'}
        </button>
        <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[14px]">
          Nothing is timed until you press this. If your headphones are not working, tell the
          invigilator now.
        </p>
      </div>
    </div>
  );
}
