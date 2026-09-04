'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { sanitizeBlock } from '@/lib/sanitize';
import { useRouter } from 'next/navigation';
import { RubricCriterion } from '@/types/db';
import { countWords } from '@/lib/utils';

interface Task {
  questionId: string; number: number; partTitle: string; prompt: string;
  minWords: number; points: number; response: string;
}

interface Saved { questionId: string; scores: Record<string, number>; comment: string; awarded: number }

export default function MarkingPanel({
  attemptId, candidate, testTitle, criteria, rubricId, tasks, saved, paperNotes,
}: {
  attemptId: string; candidate: string; testTitle: string;
  criteria: RubricCriterion[]; rubricId: string | null; tasks: Task[]; saved: Saved[];
  /** The marking instructions printed with this paper, out of its answer key. */
  paperNotes?: string | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<Record<string, { scores: Record<string, number>; comment: string }>>(() => {
    const initial: Record<string, { scores: Record<string, number>; comment: string }> = {};
    for (const t of tasks) {
      const found = saved.find((s) => s.questionId === t.questionId);
      initial[t.questionId] = { scores: found?.scores ?? {}, comment: found?.comment ?? '' };
    }
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const task = tasks[index];
  const current = task ? state[task.questionId] : null;

  /** The rubric average scaled to the marks this task is worth. */
  const awarded = useMemo(() => {
    if (!task || !current) return 0;
    const values = criteria.map((c) => current.scores[c.key]).filter((v) => typeof v === 'number');
    if (!values.length) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const maxMean = criteria.reduce((a, c) => a + c.max, 0) / criteria.length;
    return Math.round((mean / maxMean) * task.points * 10) / 10;
  }, [task, current, criteria]);

  if (!task) {
    return (
      <div className="px-[34px] py-[34px]">
        <p className="text-[18px]">This paper has no writing tasks to mark.</p>
        <Link href="/admin/marking" className="underline text-[17px]">Back to the queue</Link>
      </div>
    );
  }

  async function save() {
    setBusy(true); setMessage(null);
    const res = await fetch('/api/admin/marking', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        attemptId, questionId: task.questionId, rubricId,
        scores: current?.scores ?? {}, comment: current?.comment ?? '', awarded,
      }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? 'Could not save.'); return; }
    setMessage(data.complete ? 'Saved — every task on this paper is now marked.' : 'Saved.');
    router.refresh();
  }

  return (
    <div className="px-[34px] py-[28px] max-w-[1400px]">
      <Link href="/admin/marking" className="text-[15px] underline">← Marking queue</Link>
      <h1 className="text-[30px] font-semibold mt-[10px] mb-[4px]">{candidate}</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[22px]">{testTitle}</p>

      <div className="flex gap-[8px] mb-[20px] flex-wrap">
        {tasks.map((t, i) => (
          <button
            key={t.questionId}
            type="button"
            onClick={() => setIndex(i)}
            className={`px-[16px] h-[42px] rounded-[4px] border text-[16px] ${
              i === index ? 'border-black border-2 font-semibold' : 'border-[color:var(--line-strong)]'
            }`}
          >
            {t.partTitle} · task {t.number}
            {saved.some((s) => s.questionId === t.questionId) && <span className="ml-[8px] text-[color:var(--good)]">✓</span>}
          </button>
        ))}
      </div>

      {paperNotes && (
        <details open className="border rounded-[6px] px-[18px] py-[14px] mb-[18px]"
                 style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
          <summary className="cursor-pointer text-[16px] font-semibold">
            How this paper says to mark it
          </summary>
          {/* Straight out of the paper's own answer key, so it is filtered the
              same way every other parsed text is. */}
          <div className="mt-[10px] text-[16px] leading-[1.65] whitespace-pre-wrap"
               dangerouslySetInnerHTML={{ __html: sanitizeBlock(paperNotes) }} />
        </details>
      )}

      <div className="grid gap-[22px] lg:grid-cols-[1.4fr_1fr]">
        <section>
          {task.prompt && (
            <div className="border border-[color:var(--line)] rounded-[6px] p-[18px] mb-[16px] text-[16px] leading-[1.6]"
                 // The task text comes from a parsed paper, so it is filtered
                 // here exactly as it is in the exam screen.
                 dangerouslySetInnerHTML={{ __html: sanitizeBlock(task.prompt) }} />
          )}
          <div className="border border-[color:var(--line)] rounded-[6px] p-[22px] whitespace-pre-wrap text-[17px] leading-[1.75] min-h-[340px]">
            {task.response || <span className="text-[color:var(--paper-ink-3)]">No response was written.</span>}
          </div>
          <p className="mt-[10px] text-[15px] text-[color:var(--paper-ink-3)]">
            {countWords(task.response)} words · minimum {task.minWords}
            {countWords(task.response) < task.minWords && task.response
              ? ' · under length' : ''}
          </p>
        </section>

        <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] h-fit">
          <h2 className="text-[20px] font-semibold mb-[16px]">Rubric</h2>
          <div className="space-y-[18px]">
            {criteria.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
                  <span className="text-[16px] font-medium">{c.label}</span>
                  <span className="text-[15px] text-[color:var(--paper-ink-3)] tabular-nums">
                    {current?.scores[c.key] ?? '–'} / {c.max}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={c.max}
                  step={0.5}
                  value={current?.scores[c.key] ?? 0}
                  onChange={(e) => setState((s) => ({
                    ...s,
                    [task.questionId]: {
                      ...s[task.questionId],
                      scores: { ...s[task.questionId].scores, [c.key]: Number(e.target.value) },
                    },
                  }))}
                  className="w-full"
                  aria-label={c.label}
                />
                {c.descriptors && <p className="text-[13px] text-[color:var(--paper-ink-3)] mt-[4px]">{c.descriptors}</p>}
              </div>
            ))}
          </div>

          <label className="block mt-[20px]">
            <span className="block text-[14px] font-semibold mb-[6px]">Comment for the candidate</span>
            <textarea
              value={current?.comment ?? ''}
              onChange={(e) => setState((s) => ({
                ...s, [task.questionId]: { ...s[task.questionId], comment: e.target.value },
              }))}
              className="admin-input h-[120px]"
            />
          </label>

          <div className="mt-[18px] flex items-center justify-between gap-[12px]">
            <span className="text-[17px]">
              Marks awarded: <strong className="tabular-nums">{awarded}</strong> / {task.points}
            </span>
            <button type="button" onClick={save} disabled={busy}
                    className="px-[20px] h-[46px] text-white rounded-[4px] text-[17px] disabled:opacity-60"
                    style={{ background: 'var(--brand)' }}>
              {busy ? 'Saving…' : 'Save marks'}
            </button>
          </div>
          {message && <p className="mt-[10px] text-[15px] text-[color:var(--good)]">{message}</p>}
        </section>
      </div>
    </div>
  );
}
