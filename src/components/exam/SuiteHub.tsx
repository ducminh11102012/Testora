'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Branding } from '@/types/db';
import { SKILL_LABEL } from '@/lib/band-descriptors';
import BrandMark from '../ui/BrandMark';

export interface HubSkill {
  skill: 'listening' | 'reading' | 'writing' | 'speaking';
  status: 'not-started' | 'in-progress' | 'submitted' | 'marked';
  durationMin: number;
  videoUrl?: string;
  manual: boolean;
  attemptId: string | null;
  /** A rehearsal of this section still open, if there is one. */
  practiceAttemptId?: string | null;
  /** The last practice run that was handed in, so it leaves a trace here. */
  lastPractice?: { id: string; at: string | null; raw: number | null; marked: boolean } | null;
}

/** The lengths offered for a practice run. 0 is "as long as I like". */
const LENGTHS = [0, 10, 15, 20, 30, 45, 60, 90, 120];

/**
 * The candidate's home for a full test.
 *
 * There are two ways in. Simulation is the exam: every section, in order, to
 * the official timings, once. Practice is rehearsal: one section on its own,
 * for as long as the candidate wants, as many times as they want, and kept out
 * of the test's report. A test sat under a sitting code is always the exam.
 */
export default function SuiteHub({
  suiteId, title, description, candidateRef, branding, skills, complete, released,
  allowPractice = true, allowSimulation = true, practiceMaxMinutes = 0, invigilated = false,
}: {
  suiteId: string;
  title: string;
  description: string;
  candidateRef: string;
  branding: Branding;
  skills: HubSkill[];
  complete: boolean;
  released: boolean;
  allowPractice?: boolean;
  allowSimulation?: boolean;
  /** A centre's cap on a practice run, in minutes. 0 is no cap. */
  practiceMaxMinutes?: number;
  /** True when a sitting code opened this test: practice is not on offer. */
  invigilated?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  // A full test opened with a sitting code keeps the code, so every section is
  // recorded against that sitting.
  const code = params.get('code') ?? undefined;
  const practiceOffered = allowPractice && !invigilated && !code;
  const simulationOffered = allowSimulation || invigilated || !!code;

  const [mode, setMode] = useState<'exam' | 'practice'>(
    simulationOffered ? 'exam' : 'practice',
  );
  const [open, setOpen] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cap = practiceMaxMinutes > 0 ? practiceMaxMinutes : 0;
  const lengths = cap ? [...LENGTHS.filter((m) => m > 0 && m <= cap), cap] : LENGTHS;

  async function start(skill: string, practice: boolean) {
    setBusy(skill); setError(null);
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        suiteId,
        skill,
        ...(code ? { code } : {}),
        ...(practice ? { mode: 'practice', minutes: minutes[skill] ?? 0 } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); setError(data.error ?? 'This section could not be started.'); return; }
    router.push(`/test/${data.attemptId}${code ? `?code=${encodeURIComponent(code)}` : ''}`);
  }

  return (
    <div className="min-h-screen exam-surface">
      <header className="flex items-center justify-between px-[24px] h-[56px] border-b border-[#e4e4e4]">
        <span className="text-[15px] font-bold tracking-wide">{candidateRef}</span>
        <span className="opacity-70"><BrandMark branding={branding} size="sm" tone="brand" /></span>
      </header>

      <main className="max-w-[1120px] mx-auto px-[24px] py-[34px]">
        <h1 className="text-[26px] font-semibold mb-[6px]" style={{ color: 'var(--brand)' }}>{title}</h1>
        {description && <p className="text-[16px] text-[#5e5e5e] mb-[8px] max-w-[70ch]">{description}</p>}

        {/* ------------------------- how to sit it ------------------------ */}
        {practiceOffered && simulationOffered && (
          <div className="grid gap-[14px] sm:grid-cols-2 mt-[24px]">
            {([
              {
                key: 'exam' as const,
                name: 'Simulation',
                blurb: 'The whole test, section by section in order, to the official timings. Each section is sat once, and the result becomes your test report.',
              },
              {
                key: 'practice' as const,
                name: 'Practice',
                blurb: 'One section on its own, for as long as you choose — including no time limit. Sit it as often as you like; practice stays out of your test report.',
              },
            ]).map((card) => {
              const chosen = mode === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => { setMode(card.key); setOpen(null); }}
                  aria-pressed={chosen}
                  className="text-left border rounded-[4px] px-[22px] py-[18px] transition-colors"
                  style={{
                    borderColor: chosen ? 'var(--brand)' : '#dcdcdc',
                    background: chosen ? 'rgba(31,79,216,0.04)' : '#fff',
                    borderWidth: chosen ? 2 : 1,
                  }}
                >
                  <span className="block text-[19px] font-bold mb-[6px]">{card.name}</span>
                  <span className="block text-[15px] text-[#5e5e5e]">{card.blurb}</span>
                </button>
              );
            })}
          </div>
        )}

        {(code || invigilated) && (
          <p className="mt-[20px] text-[16px]">
            This test is being sat under exam conditions, so every section counts.
          </p>
        )}

        <div className="flex items-center gap-[16px] mt-[26px] mb-[22px]">
          <span className="text-[15px] font-bold shrink-0">
            {mode === 'practice' ? 'Choose a section' : 'Today'}
          </span>
          <span className="h-px flex-1 bg-[#1e1e1e]" />
        </div>

        {error && (
          <div className="border rounded-[4px] px-[18px] py-[12px] text-[16px] mb-[20px]"
               style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
            {error}
          </div>
        )}

        <div className="space-y-[18px]">
          {skills.map((s) => {
            const done = s.status === 'submitted' || s.status === 'marked';
            const isOpen = open === s.skill;
            const hasConfirmed = confirmed.includes(s.skill);
            const chosenLength = minutes[s.skill] ?? 0;
            return (
              <section key={s.skill} className="border border-[#dcdcdc] rounded-[2px] px-[26px] py-[22px]">
                <h2 className="text-[21px] font-bold mb-[10px]">{SKILL_LABEL[s.skill]}</h2>
                <p className={`text-[16px] font-bold mb-[10px] ${done ? 'text-[color:var(--good)]' : 'text-[color:var(--bad)]'}`}>
                  {s.manual && !done ? 'Sat with an examiner' : done ? 'Completed' : s.status === 'in-progress' ? 'In progress' : 'Not completed'}
                </p>
                <p className="text-[15px] text-[#5e5e5e]">
                  {s.manual
                    ? 'Marked by your centre'
                    : mode === 'practice'
                      ? 'Practice run — as long as you like, as often as you like'
                      : s.durationMin > 0
                        ? `Timing: ${s.durationMin} minutes`
                        : 'No time limit — you can come back and finish later'}
                </p>

                {/* ------------------------- practice ------------------------ */}
                {!s.manual && mode === 'practice' && (
                  <div className="mt-[18px] flex flex-wrap items-end gap-[14px]">
                    <label className="block">
                      <span className="block text-[14px] font-semibold mb-[6px]">How long?</span>
                      <select
                        className="border border-[#c8c8c8] rounded-[2px] h-[44px] px-[12px] text-[16px] bg-white"
                        value={chosenLength}
                        onChange={(e) => setMinutes((m) => ({ ...m, [s.skill]: Number(e.target.value) }))}
                      >
                        {lengths.map((m) => (
                          <option key={m} value={m}>{m === 0 ? 'No time limit' : `${m} minutes`}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => start(s.skill, true)}
                      disabled={busy === s.skill}
                      className="px-[26px] h-[46px] text-white text-[16px] rounded-[2px] disabled:opacity-60"
                      style={{ background: 'var(--brand)' }}
                    >
                      {busy === s.skill ? 'Starting…' : `Practise ${SKILL_LABEL[s.skill]}`}
                    </button>
                    {s.practiceAttemptId && (
                      <Link href={`/test/${s.practiceAttemptId}`} className="underline text-[16px] pb-[12px]">
                        Resume your practice run
                      </Link>
                    )}
                    {cap > 0 && (
                      <span className="text-[14px] text-[#5e5e5e] pb-[14px]">
                        Your centre caps practice at {cap} minutes.
                      </span>
                    )}
                  </div>
                )}

                {!s.manual && mode === 'practice' && s.lastPractice && (
                  <p className="mt-[12px] text-[16px] text-[#5e5e5e]">
                    Your last practice run
                    {s.lastPractice.at ? ` on ${new Date(s.lastPractice.at).toLocaleDateString()}` : ''}
                    {s.lastPractice.raw !== null && s.lastPractice.marked
                      ? ` scored ${s.lastPractice.raw}`
                      : ' is marked'}
                    .{' '}
                    <Link href={`/results/${s.lastPractice.id}`} className="underline">
                      See it again
                    </Link>
                  </p>
                )}

                {/* ------------------------ simulation ----------------------- */}
                {!s.manual && !done && mode === 'exam' && (
                  <div className="mt-[18px] border border-[#e4e4e4] bg-[#fafafa]">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : s.skill)}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-[14px] px-[20px] py-[14px] text-left"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                           strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                           style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                        <path d="M5 8.5 12 15.5 19 8.5" />
                      </svg>
                      <span className="text-[16px]">Test information.</span>
                      <span className={`text-[16px] ${hasConfirmed ? 'text-[color:var(--good)]' : 'text-[color:var(--bad)]'}`}>
                        {hasConfirmed ? 'Confirmed.' : 'Not confirmed.'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-[20px] pb-[20px]">
                        {s.videoUrl && (
                          <video
                            key={s.videoUrl}
                            src={s.videoUrl}
                            controls
                            playsInline
                            className="w-full max-w-[860px] bg-black"
                            aria-label={`Instructions for the ${SKILL_LABEL[s.skill]} test`}
                          />
                        )}
                        <h3 className="text-[19px] font-bold mt-[20px] mb-[6px]">Ready?</h3>
                        <p className="text-[16px] mb-[14px]">
                          Please confirm that you have understood the instructions above. This section is
                          sat once and counts towards your test report.
                        </p>
                        {hasConfirmed ? (
                          <button
                            type="button"
                            onClick={() => start(s.skill, false)}
                            disabled={busy === s.skill}
                            className="px-[26px] h-[46px] text-white text-[16px] rounded-[2px] disabled:opacity-60"
                            style={{ background: 'var(--brand)' }}
                          >
                            {busy === s.skill ? 'Starting…' : `Start ${SKILL_LABEL[s.skill]}`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmed((c) => [...c, s.skill])}
                            className="px-[22px] h-[46px] bg-[#1e1e1e] text-white text-[16px] rounded-[2px] inline-flex items-center gap-[10px]"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4.5 12.8 9.6 18 19.5 6.5" />
                            </svg>
                            I confirm
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {mode === 'exam' && s.status === 'in-progress' && s.attemptId && (
                  <Link
                    href={`/test/${s.attemptId}${code ? `?code=${encodeURIComponent(code)}` : ''}`}
                    className="inline-block mt-[16px] underline text-[16px]"
                  >
                    Resume this section
                  </Link>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-[34px] flex items-center gap-[18px] flex-wrap">
          {complete ? (
            <Link
              href={`/suite/${suiteId}/report`}
              className="px-[26px] h-[52px] leading-[52px] text-white text-[17px] rounded-[2px]"
              style={{ background: 'var(--brand)' }}
            >
              {released ? 'View your test report' : 'See your progress'}
            </Link>
          ) : (
            <p className="text-[16px] text-[#5e5e5e]">
              Your test report becomes available once every section has been sat as part of the test itself.
            </p>
          )}
          <Link href="/dashboard" className="text-[16px] underline">Back to your tests</Link>
        </div>
      </main>
    </div>
  );
}
