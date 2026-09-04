'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Pill } from '../ui/Shell';

interface Live {
  status: string;
  stage: string;
  percent: number;
  done: number;
  total: number;
  paper: string | null;
  chars: number;
  tail: string;
  error: string | null;
}

interface Job {
  id: string;
  filename: string;
  status: string;
  stage: string;
  percent?: number;
  provider: string | null;
  testId: string | null;
  /** A book makes many papers, not one. */
  testIds?: string[];
  kind?: string;
  error: string | null;
  warnings: string[];
  createdAt: string;
}

const RUNNING = new Set(['pending', 'queued', 'parsing']);

export default function ImportWizard({ provider, recent }: { provider: string; recent: Job[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [folder, setFolder] = useState('');
  const [strategy, setStrategy] = useState<'hybrid' | 'rules' | 'ai'>('hybrid');
  const [module, setModule] = useState('');
  const [title, setTitle] = useState('');
  const [writeAnswers, setWriteAnswers] = useState(true);
  const [publish, setPublish] = useState(false);
  const [bank, setBank] = useState(false);
  const [explain, setExplain] = useState(false);
  /*
   * "This upload is a whole book." Left off, the splitter is cautious and cuts
   * only where a book says so itself ("Test 1", "ĐỀ SỐ 2") — it has to be,
   * because chopping a single paper into pieces is worse than leaving it whole.
   * Ticked, one paper is a failure: it cuts on exercise headings, on numbering
   * that starts over, and finally on length.
   */
  const [book, setBook] = useState(false);
  const [grain, setGrain] = useState<'auto' | 'test' | 'exercise' | 'chunk'>('auto');
  const [fileByType, setFileByType] = useState(true);
  /**
   * The opposite of the book tick: some papers really do have four parts and
   * three question types and are sat in one go. Ticked, nothing is cut — not
   * into papers, not into skills.
   */
  const [keepWhole, setKeepWhole] = useState(false);
  /**
   * "The answers start on page 50." The one fact about a PDF an operator always
   * has and no parser can guess — a key with no heading, or headed with a word
   * nobody thought of, is otherwise invisible.
   */
  const [keyPage, setKeyPage] = useState('');
  const [keyFirst, setKeyFirst] = useState(true);
  const [writing, setWriting] = useState(false);
  const [compose, setCompose] = useState({
    title: '', instructions: '', module: '', questions: 40, minutes: 60, sample: '', bank: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>(recent);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [watching, setWatching] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/import');
    if (!res.ok) return;
    const data = await res.json();
    setJobs(data.imports ?? []);
  }, []);

  // Only poll while something is actually being read.
  const working = jobs.some((j) => RUNNING.has(j.status));
  useEffect(() => {
    if (!working) return;
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [working, refresh]);

  /*
   * Watch the running job as it happens.
   *
   * The list above is polled every two and a half seconds, which is fine for
   * "is it done yet" and useless for watching a model write. This opens a
   * stream for the job at the top and follows it: the stage, the percentage,
   * and the end of what the model is producing right now. The server closes the
   * stream after a few minutes, and `reconnect` says to open another — which is
   * what a book needs, because a book takes longer than any one connection
   * should be held open.
   */
  const runningId = jobs.find((j) => RUNNING.has(j.status))?.id ?? null;
  /*
   * The panel follows the newest job rather than only a running one: a small
   * paper is read in a few seconds, and a panel that vanishes the moment it
   * finishes is a panel nobody ever sees. The stream's last event says 100%,
   * and that is what stays on screen.
   */
  const newestId = jobs[0]?.id ?? null;
  const shown = newestId && live[newestId] ? newestId : null;

  useEffect(() => {
    if (!runningId) { setWatching(null); return undefined; }
    let source: EventSource | null = null;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      source = new EventSource(`/api/admin/import/${runningId}/stream`);
      setWatching(runningId);
      source.addEventListener('progress', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as Live;
        setLive((all) => ({ ...all, [runningId]: data }));
      });
      source.addEventListener('finished', () => {
        source?.close();
        void refresh();
      });
      source.addEventListener('reconnect', () => {
        source?.close();
        setTimeout(open, 250);
      });
      source.onerror = () => {
        // A dropped connection is normal on a long job; try again shortly.
        source?.close();
        if (!stopped) setTimeout(open, 2000);
      };
    };
    open();

    return () => { stopped = true; source?.close(); setWatching(null); };
  }, [runningId, refresh]);

  async function upload() {
    if (!file) return;
    setBusy(true); setError(null); setNotice(null);
    const form = new FormData();
    form.set('file', file);
    form.set('strategy', strategy);
    form.set('writeAnswers', writeAnswers ? '1' : '0');
    form.set('publish', publish ? '1' : '0');
    form.set('bank', bank ? '1' : '0');
    form.set('explain', explain ? '1' : '0');
    form.set('book', book ? '1' : '0');
    form.set('grain', grain);
    form.set('fileByType', fileByType ? '1' : '0');
    form.set('keepWhole', keepWhole ? '1' : '0');
    if (keyPage.trim()) form.set('keyFromPage', keyPage.trim());
    form.set('keyFirst', keyFirst ? '1' : '0');
    if (keyFile) form.set('keyFile', keyFile);
    if (folder.trim()) form.set('folder', folder.trim());
    if (module) form.set('module', module);
    if (title) form.set('title', title);

    const res = await fetch('/api/admin/import', { method: 'POST', body: form });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'The document could not be read.'); return; }
    setNotice(data.message ?? 'The paper is being read.');
    setFile(null); setTitle(''); setKeyFile(null);
    if (fileRef.current) fileRef.current.value = '';
    if (keyRef.current) keyRef.current.value = '';
    void refresh();
  }

  /** Asks the model to write a paper rather than read one. */
  async function writePaper() {
    setBusy(true); setError(null); setNotice(null);
    const res = await fetch('/api/admin/compose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(compose),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error ?? 'The paper could not be started.'); return; }
    setNotice(data.message ?? 'The paper is being written.');
    setCompose({ ...compose, instructions: '', sample: '' });
    void refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/import/${id}`, { method: 'DELETE' });
    void refresh();
  }

  return (
    <div className="px-[34px] py-[38px] max-w-[1200px]">
      <h1 className="text-[32px] font-semibold mb-[6px]">Import a paper</h1>
      <p className="text-[17px] text-[color:var(--paper-ink-3)] mb-[26px] max-w-[80ch]">
        Upload one paper or a whole book — a book is cut into its tests on the headings it prints
        (&ldquo;Test 4&rdquo;, &ldquo;ĐỀ SỐ 12&rdquo;), each test is read on its own, and the answer key
        at the back is handed back to the test it belongs to. Word (.docx), PDF, plain-text,
        <strong> photograph or scan</strong> — IELTS, Cambridge,
        a national or provincial specialised-English paper, or a school mock. Reading happens in the
        background: the rule engine takes the structure and the printed key, the model classifies each
        task and places the gaps, and the finished paper lands in your papers as a draft. A photograph
        or a scan with no text in it goes to the vision provider instead, which reads the pages as
        images. You can leave this page.
      </p>

      <div
        className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[26px]"
        style={{ background: provider === 'none' ? '#FFFCF0' : '#F1F7F1', borderColor: provider === 'none' ? '#EFE3B0' : '#CFE3CF' }}
      >
        {provider === 'none'
          ? 'No AI provider is configured — uploads use the rule-based engine only, and papers with no printed answer key stay without one. Set one up under Platform → AI settings.'
          : `AI pass ready: ${provider}.`}
      </div>

      <div className="border border-[color:var(--line)] rounded-[3px] p-[24px] mb-[30px]">
        <div className="grid gap-[16px] sm:grid-cols-2">
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Document (the paper, or a whole book)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="admin-input pt-[9px]"
            />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">
              Answer key, if it came as a separate file (optional)
            </span>
            <input
              ref={keyRef}
              type="file"
              accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
              className="admin-input pt-[9px]"
            />
            <span className="block text-[14px] text-[color:var(--paper-ink-3)] mt-[5px]">
              Only when the key is its own document. A key printed inside the paper is read from
              there, and a paper with no key at all needs nothing here — the model writes one.
              Marking instructions in the key (what each criterion is worth, how spelling is
              treated) are kept on the paper and go to whoever marks the writing.
            </span>
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">
              Answers start on page (optional)
            </span>
            <input
              value={keyPage}
              onChange={(e) => setKeyPage(e.target.value.replace(/[^0-9]/g, ''))}
              className="admin-input"
              inputMode="numeric"
              placeholder="e.g. 50 — the first page of the key at the back"
            />
            <span className="block text-[15px] text-[color:var(--paper-ink-3)] mt-[6px]">
              PDF only. Everything from that page on is read as the answer key and nothing else —
              no heading to find, no grid to recognise. Use it when the key at the back is not
              being picked up, or is headed with something unusual.
            </span>
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Title (optional)</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input"
                   placeholder="Taken from the file name if left blank" />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Folder (optional)</span>
            <input value={folder} onChange={(e) => setFolder(e.target.value)} className="admin-input"
                   placeholder="Cambridge IELTS 15 · Đề HSG 2024 — a book uses its own title" />
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Module (optional hint)</span>
            <select value={module} onChange={(e) => setModule(e.target.value)} className="admin-input">
              <option value="">Let the parser decide</option>
              <option value="reading">Reading</option>
              <option value="listening">Listening</option>
              <option value="writing">Writing</option>
              <option value="mixed">Mixed (whole paper)</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[14px] font-semibold mb-[6px]">Strategy</span>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)} className="admin-input">
              <option value="hybrid">Hybrid — rules then AI (recommended)</option>
              <option value="rules">Rule-based only (no API call)</option>
              <option value="ai">AI only (ignore the rule outline)</option>
            </select>
          </label>
        </div>

        <div className="mt-[16px] space-y-[8px]">
          <label className="flex items-start gap-[10px] text-[16px]">
            <input type="checkbox" checked={writeAnswers} onChange={(e) => setWriteAnswers(e.target.checked)} className="mt-[5px]" />
            <span>
              Write the answer key where the paper has none
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                The model works the missing answers out of the text and marks each one
                &ldquo;supplied by AI&rdquo; so you can check it. Printed answers are never overwritten.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-[10px] text-[16px]">
            <input type="checkbox" checked={keyFirst} onChange={(e) => setKeyFirst(e.target.checked)} className="mt-[5px]" />
            <span>
              Read the answer key first, then the paper
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                Whenever a key is available — its own file, the page above, or the back of the book —
                it is read before the paper and handed to the model with it, with instructions to
                copy it rather than solve anything. A model that has the printed answers in front of
                it stops inventing them; the key is applied again afterwards as well.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-[10px] text-[16px]">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Publish it straight away instead of saving it as a draft
          </label>
          <label className="flex items-start gap-[10px] text-[16px]">
            <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} className="mt-[5px]" />
            <span>
              Explain every answer
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                The model writes two or three sentences per question — which line of the passage gives
                it away, why the tempting option is wrong — in the language of the paper. Candidates
                see them on their review screen after handing in, so a wrong answer teaches something.
                One extra model call per ten questions.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-[10px] text-[16px]">
            <input
              type="checkbox" checked={book} className="mt-[5px]"
              onChange={(e) => { setBook(e.target.checked); if (e.target.checked) setKeepWhole(false); }}
            />
            <span>
              This upload is a whole book — split it into separate papers
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                Without this, a file is only cut where it says so itself (&ldquo;Test 1&rdquo;,
                &ldquo;ĐỀ SỐ 2&rdquo;) — cutting a single paper into pieces would be worse than
                leaving it whole. With it, one paper counts as a failure: the exercise headings are
                tried next (&ldquo;Part 5&rdquo;, &ldquo;Exercise 12&rdquo;, &ldquo;Bài 3&rdquo;),
                then numbering that starts again at 1, then length. Each piece becomes its own paper
                in the bank.
              </span>
            </span>
          </label>
          {book && (
            <div className="ml-[28px] space-y-[8px] border-l-[3px] border-[#e2e2e2] pl-[14px]">
              <label className="block max-w-[520px]">
                <span className="block text-[14px] font-semibold mb-[6px]">Where does one paper end?</span>
                <select value={grain} onChange={(e) => setGrain(e.target.value as typeof grain)} className="admin-input">
                  <option value="auto">Work it out (recommended)</option>
                  <option value="test">Each whole test — &ldquo;Test 1&rdquo;, &ldquo;ĐỀ SỐ 2&rdquo;</option>
                  <option value="exercise">Each exercise — &ldquo;Part 5&rdquo;, &ldquo;Exercise 12&rdquo;, &ldquo;Bài 3&rdquo;</option>
                  <option value="chunk">Cut by length — the book prints no headings at all</option>
                </select>
              </label>
              <label className="flex items-start gap-[10px] text-[16px]">
                <input type="checkbox" checked={fileByType} onChange={(e) => setFileByType(e.target.checked)} className="mt-[5px]" />
                <span>
                  File each paper under what it turns out to be
                  <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                    A book that mixes everything lands sorted: <i>Reading — Multiple choice</i>,
                    <i> Reading — True / False / Not Given</i>, <i>Writing</i>, and so on, under the
                    book&rsquo;s own folder. The type comes from the questions themselves, not from
                    the heading printed above them.
                  </span>
                </span>
              </label>
            </div>
          )}
          <label className="flex items-start gap-[10px] text-[16px]">
            <input
              type="checkbox" checked={keepWhole} className="mt-[5px]" disabled={book}
              onChange={(e) => { setKeepWhole(e.target.checked); if (e.target.checked) setBook(false); }}
            />
            <span>
              Keep this as one paper — don&rsquo;t split it at all
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                For a paper that has several parts and several skills on purpose and is sat in one
                go. Normally a paper with a listening section, a reading section and a writing task
                becomes three papers, because that is how a full test is sat; this keeps it as the
                one paper it was written as, and keeps it out of the bank.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-[10px] text-[16px]">
            <input type="checkbox" checked={bank} onChange={(e) => setBank(e.target.checked)} className="mt-[5px]" />
            <span>
              Put it in the bank
              <span className="block text-[15px] text-[color:var(--paper-ink-3)]">
                Bank papers are hidden from the paper list and reached through a full test. Full tests
                can then be built out of them at random. A book is always treated this way.
              </span>
            </span>
          </label>
        </div>

        <button
          type="button"
          onClick={upload}
          disabled={!file || busy}
          className="mt-[20px] px-[22px] h-[46px] text-white rounded-[3px] text-[17px] disabled:opacity-60"
          style={{ background: 'var(--brand)' }}
        >
          {busy ? 'Uploading…' : 'Import paper'}
        </button>
      </div>

      {/* ---------------------- written rather than read ------------------ */}
      <div className="border border-[color:var(--line)] rounded-[3px] p-[24px] mb-[30px]">
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-semibold">No paper? Have one written</h2>
          <button type="button" onClick={() => setWriting((w) => !w)} className="text-[15px] underline">
            {writing ? 'Close' : 'Open'}
          </button>
        </div>
        <p className="text-[16px] text-[color:var(--paper-ink-3)] mt-[6px] max-w-[80ch]">
          Describe the paper you want — the subject, the level, the task types, how long it should take
          — and the model writes it, answer key and all. Paste a paper of the kind you want and it will
          follow its shape without copying it. It is written in the background and lands in your papers.
        </p>

        {writing && (
          <div className="grid gap-[14px] mt-[18px]">
            <div className="grid gap-[14px] sm:grid-cols-2">
              <label className="block">
                <span className="block text-[14px] font-semibold mb-[6px]">Title</span>
                <input className="admin-input" value={compose.title}
                       placeholder="Progress test 3 — reading"
                       onChange={(e) => setCompose({ ...compose, title: e.target.value })} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-semibold mb-[6px]">Module</span>
                <select className="admin-input" value={compose.module}
                        onChange={(e) => setCompose({ ...compose, module: e.target.value })}>
                  <option value="">Let the examiner decide</option>
                  <option value="reading">Reading</option>
                  <option value="writing">Writing</option>
                  <option value="mixed">Mixed (whole paper)</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">What should it be?</span>
              <textarea className="admin-input h-[110px]" value={compose.instructions}
                        placeholder="A grade 9 gifted-student reading and lexico-grammar paper out of 20 points: an open cloze, word formation, and a passage with true/false/not given."
                        onChange={(e) => setCompose({ ...compose, instructions: e.target.value })} />
            </label>
            <div className="grid gap-[14px] sm:grid-cols-3">
              <label className="block">
                <span className="block text-[14px] font-semibold mb-[6px]">Questions</span>
                <input type="number" min={1} max={120} className="admin-input" value={compose.questions}
                       onChange={(e) => setCompose({ ...compose, questions: Number(e.target.value) })} />
              </label>
              <label className="block">
                <span className="block text-[14px] font-semibold mb-[6px]">Minutes (0 = no limit)</span>
                <input type="number" min={0} max={300} className="admin-input" value={compose.minutes}
                       onChange={(e) => setCompose({ ...compose, minutes: Number(e.target.value) })} />
              </label>
              <label className="flex items-start gap-[10px] text-[16px] pt-[26px]">
                <input type="checkbox" checked={compose.bank}
                       onChange={(e) => setCompose({ ...compose, bank: e.target.checked })} />
                <span>Put it in the bank</span>
              </label>
            </div>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">A paper to imitate (optional)</span>
              <textarea className="admin-input h-[100px]" value={compose.sample}
                        placeholder="Paste a paper of the kind you want. New material, same shape."
                        onChange={(e) => setCompose({ ...compose, sample: e.target.value })} />
            </label>
            <div>
              <button type="button" onClick={writePaper}
                      disabled={busy || provider === 'none' || compose.instructions.trim().length < 10}
                      className="px-[22px] h-[46px] text-white rounded-[3px] text-[17px] disabled:opacity-60"
                      style={{ background: 'var(--brand)' }}>
                {busy ? 'Starting…' : 'Write the paper'}
              </button>
              {provider === 'none' && (
                <span className="ml-[14px] text-[15px] text-[color:var(--paper-ink-3)]">
                  Needs an AI provider.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[24px]"
             style={{ background: '#FDF2F3', borderColor: '#F0C4C9' }}>
          {error}
        </div>
      )}
      {notice && (
        <div className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[24px]"
             style={{ background: '#F1F7F1', borderColor: '#CFE3CF' }}>
          {notice}
        </div>
      )}

      {/* --------------------------- live progress ------------------------ */}
      {shown && live[shown] && (
        <section className="border border-[color:var(--line)] rounded-[3px] p-[20px] mb-[26px]">
          <div className="flex items-baseline justify-between gap-[16px] flex-wrap mb-[10px]">
            <h2 className="text-[20px] font-semibold">
              {live[shown].stage}
            </h2>
            <span className="text-[16px] tabular-nums text-[color:var(--paper-ink-3)]">
              {live[shown].percent}%
              {live[shown].total > 1 && (
                <> · paper {Math.min(live[shown].done + 1, live[shown].total)} of {live[shown].total}</>
              )}
              {live[shown].chars > 0 && (
                <> · {live[shown].chars.toLocaleString()} characters written</>
              )}
            </span>
          </div>

          <div className="h-[8px] rounded-full bg-[color:var(--paper-sunk)] overflow-hidden mb-[6px]">
            <div
              className="h-full transition-[width] duration-500 ease-linear"
              style={{ width: `${Math.max(2, live[shown].percent)}%`, background: 'var(--brand)' }}
            />
          </div>
          <p className="text-[14px] text-[color:var(--paper-ink-3)] mb-[12px]">
            {live[shown].status === 'committed'
              ? 'Finished.'
              : live[shown].status === 'failed'
                ? (live[shown].error ?? 'It failed.')
                : `${watching === shown ? 'Watching live.' : 'Reconnecting…'} You can leave this page — the reading carries on without it.`}
          </p>

          {live[shown].tail && (
            <>
              <p className="text-[14px] font-semibold mb-[6px]">What the model is writing</p>
              <pre
                className="text-[12px] leading-[1.5] font-mono whitespace-pre-wrap break-words max-h-[220px] overflow-y-auto p-[12px] rounded-[3px]"
                style={{ background: 'var(--paper-sunk)' }}
              >
                {/* Mid-flight JSON: it is meant to look unfinished, because it is. */}
                {live[shown].tail}
              </pre>
            </>
          )}
        </section>
      )}

      <div className="flex items-center justify-between mb-[12px] mt-[36px]">
        <h2 className="text-[22px] font-semibold">Imports</h2>
        <button type="button" onClick={refresh} className="text-[15px] underline">Refresh</button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-[17px] text-[color:var(--paper-ink-3)]">Nothing imported yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[color:var(--line)]">
                <th className="py-[8px] font-semibold">File</th>
                <th className="py-[8px] font-semibold w-[180px]">Where it is</th>
                <th className="py-[8px] font-semibold w-[190px]">Engine</th>
                <th className="py-[8px] font-semibold w-[190px]">When</th>
                <th className="py-[8px] w-[170px]" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-[color:var(--line)] align-top">
                  <td className="py-[10px]">
                    {j.filename}
                    {j.error && <p className="text-[15px] text-[color:var(--bad)] mt-[4px]">{j.error}</p>}
                    {j.warnings.length > 0 && (
                      <details className="mt-[4px]">
                        <summary className="cursor-pointer text-[15px] underline">
                          {j.warnings.length} note{j.warnings.length === 1 ? '' : 's'} from the parse
                        </summary>
                        <ul className="list-disc pl-[22px] mt-[6px] text-[15px] text-[color:var(--paper-ink-3)]">
                          {/*
                            * A book leaves a note per paper, so this list runs to
                            * hundreds. The first twenty-five carry the information;
                            * the rest are the same sentences with a different label
                            * in front, and rendering them all is what made this page
                            * crawl while a book was being read.
                            */}
                          {j.warnings.slice(0, 25).map((w, i) => <li key={i} className="py-[2px]">{w}</li>)}
                          {j.warnings.length > 25 && (
                            <li className="py-[2px] italic">
                              …and {j.warnings.length - 25} more, mostly the same note against another paper.
                            </li>
                          )}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="py-[10px]">
                    <Pill tone={j.status === 'committed' ? 'good' : j.status === 'failed' ? 'bad' : 'warn'}>
                      {live[j.id]?.stage ?? j.stage}
                    </Pill>
                    {RUNNING.has(j.status) && (
                      <span className="block text-[14px] tabular-nums text-[color:var(--paper-ink-3)] mt-[4px]">
                        {live[j.id]?.percent ?? j.percent ?? 0}%
                      </span>
                    )}
                  </td>
                  <td className="py-[10px] text-[color:var(--paper-ink-3)]">{j.provider ?? '—'}</td>
                  <td className="py-[10px] text-[color:var(--paper-ink-3)]">{new Date(j.createdAt).toLocaleString()}</td>
                  <td className="py-[10px] text-right space-x-[12px] whitespace-nowrap">
                    {j.testIds && j.testIds.length > 1
                      ? <Link href="/admin/tests" className="underline">{j.testIds.length} papers</Link>
                      : j.testId && <Link href={`/admin/tests/${j.testId}`} className="underline">Open paper</Link>}
                    <button type="button" onClick={() => remove(j.id)} className="underline text-[color:var(--bad)]">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
