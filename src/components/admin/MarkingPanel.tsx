'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RubricCriterion } from '@/types/db';
import { countWords } from '@/lib/utils';

interface Task {
  questionId: string; number: number; partTitle: string; prompt: string;
  minWords: number; points: number; response: string;
}

interface Saved { questionId: string; scores: Record<string, number>; comment: string; awarded: number }

export default function MarkingPanel({
  attemptId, candidate, testTitle, criteria, rubricId, tasks, saved,
}: {
  attemptId: string; candidate: string; testTitle: string;
  criteria: RubricCriterion[]; rubricId: string | null; tasks: Task[]; saved: Saved[];
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
      <p className="text-[17px] text-[#5e5e5e] mb-[22px]">{testTitle}</p>

      <div className="flex gap-[8px] mb-[20px] flex-wrap">
        {tasks.map((t, i) => (
          <button
            key={t.questionId}
            type="button"
            onClick={() => setIndex(i)}
            className={`px-[16px] h-[42px] rounded-[4px] border text-[16px] ${
              i === index ? 'border-black border-2 font-semibold' : 'border-[#c1c1c1]'
            }`}
          >
            {t.partTitle} · task {t.number}
            {saved.some((s) => s.questionId === t.questionId) && <span className="ml-[8px] text-[color:var(--good)]">✓</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-[22px] lg:grid-cols-[1.4fr_1fr]">
        <section>
          {task.prompt && (
            <div className="border border-[#e3e3e3] rounded-[6px] p-[18px] mb-[16px] text-[16px] leading-[1.6]"
                 dangerouslySetInnerHTML={{ __html: task.prompt }} />
          )}
          <div className="border border-[#dcdcdc] rounded-[6px] p-[22px] whitespace-pre-wrap text-[17px] leading-[1.75] min-h-[340px]">
            {task.response || <span className="text-[#8a8a8a]">No response was written.</span>}
          </div>
          <p className="mt-[10px] text-[15px] text-[#5e5e5e]">
            {countWords(task.response)} words · minimum {task.minWords}
            {countWords(task.response) < task.minWords && task.response
              ? ' · under length' : ''}
          </p>
        </section>

        <section className="border border-[#dcdcdc] rounded-[6px] p-[22px] h-fit">
          <h2 className="text-[20px] font-semibold mb-[16px]">Rubric</h2>
          <div className="space-y-[18px]">
            {criteria.map((c) => (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-[10px] mb-[6px]">
                  <span className="text-[16px] font-medium">{c.label}</span>
                  <span className="text-[15px] text-[#5e5e5e] tabular-nums">
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
                {c.descriptors && <p className="text-[13px] text-[#8a8a8a] mt-[4px]">{c.descriptors}</p>}
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
