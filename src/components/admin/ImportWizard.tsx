'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExamContent, QUESTION_TYPE_LABEL, groupRangeLabel, totalQuestions } from '@/types/exam';

interface Recent {
  id: string; filename: string; status: string; provider: string | null; createdAt: string; testId: string | null;
}

type Result = {
  id: string;
  content: ExamContent;
  warnings: string[];
  usedAi: boolean;
  provider: string;
  model?: string;
  ruleConfidence: number;
  textPreview: string;
};

export default function ImportWizard({ provider, recent }: { provider: string; recent: Recent[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'hybrid' | 'rules' | 'ai'>('hybrid');
  const [module, setModule] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showText, setShowText] = useState(false);
  const [committing, setCommitting] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true); setError(null); setResult(null);
    const form = new FormData();
    form.set('file', file);
    form.set('strategy', strategy);
    if (module) form.set('module', module);
    if (title) form.set('title', title);

    const res = await fetch('/api/admin/import', { method: 'POST', body: form });
    setBusy(false);
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'The document could not be parsed.'); return; }
    setResult(data);
  }

  async function commit(publish: boolean) {
    if (!result) return;
    setCommitting(true);
    const res = await fetch(`/api/admin/import/${result.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: result.content, publish }),
    });
    const data = await res.json();
    setCommitting(false);
    if (!res.ok) { setError(data.error ?? 'Could not create the test.'); return; }
    router.push(`/admin/tests/${data.testId}`);
  }

  return (
    <div className="px-[34px] py-[38px] max-w-[1200px]">
      <h1 className="text-[32px] font-semibold mb-[6px]">Import a paper</h1>
      <p className="text-[17px] text-[#5e5e5e] mb-[26px]">
        Upload a Word (.docx), PDF or plain-text paper — IELTS, Cambridge, a national or provincial
        specialised-English paper, or a school mock. The rule engine reads the structure and the printed
        answer key; the model then classifies each task and places the gaps. Nothing becomes a paper until
        you have reviewed it.
      </p>

      <div
        className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[26px]"
        style={{ background: provider === 'none' ? '#FFFCF0' : '#F1F7F1', borderColor: provider === 'none' ? '#EFE3B0' : '#CFE3CF' }}
      >
        {provider === 'none'
          ? 'No AI provider is configured — uploads will use the rule-based engine only. Add an API key to .env to switch the model pass on.'
          : `AI pass ready: ${provider}.`}
      </div>

      {!result && (
        <div className="border border-[#dcdcdc] rounded-[3px] p-[24px] mb-[30px]">
          <div className="grid gap-[16px] sm:grid-cols-2">
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Document</span>
              <input
                type="file"
                accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="admin-input pt-[9px]"
              />
            </label>
            <label className="block">
              <span className="block text-[14px] font-semibold mb-[6px]">Title (optional)</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input"
                     placeholder="Taken from the file name if left blank" />
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

          <button
            type="button"
            onClick={upload}
            disabled={!file || busy}
            className="mt-[20px] px-[22px] h-[46px] text-white rounded-[3px] text-[17px] disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {busy ? 'Reading the paper…' : 'Parse document'}
          </button>
          {busy && (
            <p className="text-[15px] text-[#5e5e5e] mt-[10px]">
              Large papers can take up to a minute — the model reads the whole document before answering.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[24px]"
             style={{ background: '#FDF2F3', borderColor: '#F0C4C9' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="border border-[#dcdcdc] rounded-[3px] p-[24px]">
          <div className="flex items-start justify-between gap-[16px] mb-[18px] flex-wrap">
            <div>
              <h2 className="text-[24px] font-semibold">{result.content.title}</h2>
              <p className="text-[16px] text-[#5e5e5e] mt-[4px]">
                {result.content.parts.length} part(s) · {totalQuestions(result.content)} question(s) ·{' '}
                <span className="capitalize">{result.content.module}</span> ·{' '}
                {result.usedAi ? `parsed with ${result.provider}${result.model ? ` (${result.model})` : ''}` : 'rule-based parse'}
              </p>
            </div>
            <div className="flex gap-[10px]">
              <button type="button" onClick={() => setResult(null)}
                      className="px-[16px] h-[44px] border border-[#8f8f8f] rounded-[3px]">Discard</button>
              <button type="button" onClick={() => commit(false)} disabled={committing}
                      className="px-[16px] h-[44px] border border-[#8f8f8f] rounded-[3px] disabled:opacity-60">
                Save as draft
              </button>
              <button type="button" onClick={() => commit(true)} disabled={committing}
                      className="px-[18px] h-[44px] text-white rounded-[3px]" style={{ background: 'var(--brand)' }}>
                {committing ? 'Creating…' : 'Create & publish'}
              </button>
            </div>
          </div>

          {result.warnings.length > 0 && (
            <ul className="border rounded-[3px] px-[20px] py-[14px] text-[16px] mb-[20px] list-disc pl-[36px]"
                style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}>
              {result.warnings.map((w, i) => <li key={i} className="py-[2px]">{w}</li>)}
            </ul>
          )}

          {result.content.parts.map((p) => (
            <section key={p.id} className="mb-[22px]">
              <h3 className="text-[20px] font-semibold mb-[8px]">
                {p.title} {p.passage ? <span className="text-[15px] font-normal text-[#5e5e5e]">· passage detected</span> : null}
              </h3>
              {p.passage && (
                <details className="mb-[10px]">
                  <summary className="cursor-pointer text-[15px] underline">Show passage</summary>
                  <div className="exam-body text-[15px] border border-[#ececec] p-[14px] mt-[8px] max-h-[320px] overflow-y-auto"
                       dangerouslySetInnerHTML={{ __html: p.passage.html }} />
                </details>
              )}
              <table className="w-full text-[15px] border-collapse">
                <thead>
                  <tr className="text-left border-b border-[#dcdcdc]">
                    <th className="py-[8px] w-[170px] font-semibold">Range</th>
                    <th className="py-[8px] font-semibold">Task type</th>
                    <th className="py-[8px] w-[120px] font-semibold">Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {p.groups.map((g) => {
                    const withKey = g.questions.filter((q) => q.answers.length).length;
                    return (
                      <tr key={g.id} className="border-b border-[#f2f2f2]">
                        <td className="py-[8px]">{g.heading ?? groupRangeLabel(g)}</td>
                        <td className="py-[8px]">{QUESTION_TYPE_LABEL[g.type]}</td>
                        <td className={`py-[8px] ${withKey === g.questions.length ? 'text-[#1f6b1f]' : 'text-[#c4142e]'}`}>
                          {withKey} / {g.questions.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}

          <button type="button" onClick={() => setShowText((v) => !v)} className="text-[15px] underline">
            {showText ? 'Hide' : 'Show'} the raw extracted text
          </button>
          {showText && (
            <pre className="mt-[10px] max-h-[360px] overflow-auto border border-[#ececec] p-[14px] text-[13px] whitespace-pre-wrap">
              {result.textPreview}
            </pre>
          )}
        </div>
      )}

      {recent.length > 0 && !result && (
        <>
          <h2 className="text-[22px] font-semibold mt-[36px] mb-[12px]">Recent imports</h2>
          <table className="w-full text-[16px] border-collapse">
            <thead>
              <tr className="text-left border-b border-[#dcdcdc]">
                <th className="py-[8px] font-semibold">File</th>
                <th className="py-[8px] font-semibold w-[130px]">Status</th>
                <th className="py-[8px] font-semibold w-[220px]">Engine</th>
                <th className="py-[8px] font-semibold w-[200px]">When</th>
                <th className="py-[8px] w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[#f2f2f2]">
                  <td className="py-[9px]">{r.filename}</td>
                  <td className="py-[9px] capitalize">{r.status}</td>
                  <td className="py-[9px] text-[#5e5e5e]">{r.provider ?? '—'}</td>
                  <td className="py-[9px] text-[#5e5e5e]">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="py-[9px] text-right">
                    {r.testId && <Link href={`/admin/tests/${r.testId}`} className="underline">Open</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
