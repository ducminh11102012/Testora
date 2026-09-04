'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The two ways out of "there is nothing here to sit".
 *
 * The first draws a full test out of the centre's bank at random and puts it on
 * the candidate's dashboard. The second asks the model to write a paper to the
 * candidate's own description — a slower thing, so it runs in the background
 * and this panel watches it.
 */
export default function NoPaperPanel({
  canAssemble, canCompose,
}: {
  canAssemble: boolean;
  canCompose: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'draw' | 'write' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [form, setForm] = useState({
    instructions: '', module: 'reading', questions: 20, minutes: 40, sample: '',
  });

  // A paper takes a minute or two to write, so the panel asks how it is going.
  useEffect(() => {
    if (!jobId) return undefined;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/compose?id=${encodeURIComponent(jobId)}`);
      const data = await res.json().catch(() => ({}));
      const job = data.job as { status?: string; error?: string } | undefined;
      if (job?.status === 'committed') {
        clearInterval(timer);
        setJobId(null);
        setBusy(null);
        setNote('Your paper is ready.');
        router.refresh();
      } else if (job?.status === 'failed') {
        clearInterval(timer);
        setJobId(null);
        setBusy(null);
        setError(job.error ?? 'The paper could not be written.');
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [jobId, router]);

  async function draw() {
    setBusy('draw'); setError(null); setNote(null);
    const res = await fetch('/api/suites/assemble', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setError(data.error ?? 'Nothing could be drawn for you.'); return; }
    router.push(`/suite/${data.suiteId}`);
  }

  async function write() {
    setBusy('write'); setError(null); setNote(null);
    const res = await fetch('/api/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(null); setError(data.error ?? 'The paper could not be started.'); return; }
    setJobId(data.id);
    setNote('Writing your paper. You can leave this page — it appears in your tests when it is done.');
  }

  if (!canAssemble && !canCompose) return null;

  return (
    <section className="border border-[color:var(--line)] rounded-[6px] p-[22px] mt-[34px]">
      <h2 className="text-[21px] font-semibold mb-[6px]">Nothing you fancy?</h2>
      <p className="text-[16px] text-[color:var(--paper-ink-3)] mb-[16px] max-w-[70ch]">
        Pick one of these and you will have something to sit in a moment.
      </p>

      {error && <p className="text-[16px] text-[color:var(--bad)] mb-[14px]">{error}</p>}
      {note && <p className="text-[16px] text-[color:var(--good)] mb-[14px]">{note}</p>}

      <div className="flex flex-wrap gap-[12px]">
        {canAssemble && (
          <button type="button" onClick={draw} disabled={busy !== null} className="p-btn disabled:opacity-60">
            {busy === 'draw' ? 'Drawing…' : "Can't decide? Pick one for me"}
          </button>
        )}
        {canCompose && (
          <button
            type="button"
            onClick={() => setWriting((w) => !w)}
            disabled={busy === 'write'}
            className="px-[24px] h-[50px] leading-[50px] rounded-[4px] border border-[color:var(--line-strong)] text-[17px] disabled:opacity-60"
          >
            No paper at all? Have one written
          </button>
        )}
      </div>

      {canCompose && writing && (
        <div className="mt-[20px] grid gap-[14px] max-w-[760px]">
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">What do you want to practise?</span>
            <textarea
              className="admin-input h-[110px]"
              placeholder="A reading paper about climate science at IELTS band 6.5–7.5, with true/false/not given and matching headings."
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            />
          </label>
          <div className="grid gap-[14px] sm:grid-cols-3">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Skill</span>
              <select className="admin-input" value={form.module}
                      onChange={(e) => setForm({ ...form, module: e.target.value })}>
                <option value="reading">Reading</option>
                <option value="writing">Writing</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Questions</span>
              <input type="number" min={1} max={60} className="admin-input" value={form.questions}
                     onChange={(e) => setForm({ ...form, questions: Number(e.target.value) })} />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Minutes (0 = no limit)</span>
              <input type="number" min={0} max={240} className="admin-input" value={form.minutes}
                     onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} />
            </label>
          </div>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">
              A paper of the kind you want, if you have one (optional)
            </span>
            <textarea
              className="admin-input h-[90px]"
              placeholder="Paste a sample paper here. The examiner follows its shape and level, but writes new material."
              value={form.sample}
              onChange={(e) => setForm({ ...form, sample: e.target.value })}
            />
          </label>
          <div>
            <button type="button" onClick={write} disabled={busy === 'write' || form.instructions.trim().length < 10}
                    className="p-btn disabled:opacity-60">
              {busy === 'write' ? 'Writing…' : 'Write my paper'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
