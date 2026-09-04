'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import DeleteButton from './DeleteButton';
import AudioUploader from './AudioUploader';
import {
  ExamContent, FAMILY_OF, FIXED_OPTIONS, Group, Part, QUESTION_TYPE_LABEL, Question, QuestionType,
  TYPE_GROUPS, emptyContent, renumber, totalPoints, totalQuestions, isListeningPart, scoringOf,
  listeningParts,
} from '@/types/exam';
import { indexToLetter, indexToRoman, uid } from '@/lib/utils';

const TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];

/** The shape the pre-flight route answers with. Mirrors src/lib/preflight.ts. */
interface Problem { code: string; message: string; where?: string; numbers?: number[] }
interface PreflightReport { blocking: Problem[]; advisory: Problem[]; summary: string }

function TypeOptions() {
  return (
    <>
      {TYPE_GROUPS.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.types.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
        </optgroup>
      ))}
    </>
  );
}

export default function TestEditor({
  testId, initial, status, visibility: initialVisibility, priceCredits: initialPrice, isPlatformTenant,
  inBank = false, folder: initialFolder = '', shared: initialShared = false, canDelete = false,
}: {
  testId: string;
  initial: ExamContent;
  status: string;
  visibility: string;
  priceCredits: number;
  /** In the bank: a full test may be built out of this paper at random. */
  inBank?: boolean;
  /** The folder it is filed under, in the console and for candidates. */
  folder?: string;
  /** Shared with every organisation. Only the platform tenant may set it. */
  shared?: boolean;
  isPlatformTenant: boolean;
  /** Deleting a paper deletes its attempts, so only owners and admins see it. */
  canDelete?: boolean;
}) {
  const [content, setContent] = useState<ExamContent>(() => initial ?? emptyContent());
  const [testStatus, setTestStatus] = useState(status);
  const [partIdx, setPartIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [visibility, setVisibility] = useState(initialVisibility);
  const [priceCredits, setPriceCredits] = useState(initialPrice);
  const [bank, setBank] = useState(inBank);
  const [folder, setFolder] = useState(initialFolder);
  const [shared, setShared] = useState(initialShared);
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explainNote, setExplainNote] = useState<string | null>(null);

  const part: Part | undefined = content.parts[partIdx];

  const mutate = useCallback((fn: (draft: ExamContent) => void) => {
    setContent((prev) => {
      const next: ExamContent = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }, []);

  /**
   * Runs the paper through the same checklist that publishing enforces, over
   * the draft in the editor rather than the saved copy — so a teacher fixing
   * something sees the list shrink as they go.
   */
  const runCheck = useCallback(async (draft: ExamContent) => {
    setChecking(true);
    const res = await fetch(`/api/admin/tests/${testId}/preflight`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: draft }),
    });
    setChecking(false);
    if (!res.ok) return;
    setReport(await res.json() as PreflightReport);
  }, [testId]);

  // Checked on arrival, and again a moment after every edit stops.
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(() => void runCheck(content), 900);
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current); };
  }, [content, runCheck]);

  /**
   * Has the model write "why the answer is the answer" for every question that
   * does not have it yet. It runs in the background — a sixty-question paper is
   * six model calls — and the import screen shows how far along it is.
   */
  async function explainAnswers() {
    setExplaining(true); setExplainNote(null);
    const res = await fetch(`/api/admin/tests/${testId}/explain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setExplaining(false);
    setExplainNote(data.message ?? data.error ?? 'That could not be started.');
  }

  async function save(nextStatus?: string) {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/tests/${testId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content, visibility, priceCredits, bank, folder,
        ...(isPlatformTenant ? { shared } : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const failed = await res.json().catch(() => ({})) as { error?: string; blocking?: Problem[] };
      setMessage(failed.error ?? 'Save failed');
      // Publishing is refused with the list of reasons; show them where the
      // rest of the checklist lives rather than in a single line of red.
      if (failed.blocking?.length) {
        setReport({ blocking: failed.blocking, advisory: [], summary: failed.error ?? '' });
      }
      return;
    }
    if (nextStatus) setTestStatus(nextStatus);
    setMessage('Saved.');
    void runCheck(content);
    setTimeout(() => setMessage(null), 2500);
  }

  const counts = useMemo(() => totalQuestions(content), [content]);
  const points = useMemo(() => totalPoints(content), [content]);

  /** How many answers already say why they are the answer. */
  const explained = useMemo(() => {
    let possible = 0;
    let written = 0;
    for (const part of content.parts) {
      for (const group of part.groups) {
        for (const q of group.questions) {
          const essay = FAMILY_OF[group.type] === 'essay';
          if (essay || !q.answers.length) continue;
          possible += 1;
          if (q.explanation?.trim()) written += 1;
        }
      }
    }
    return { possible, written };
  }, [content]);

  /* ----------------------------- structure ---------------------------- */

  function addPart() {
    mutate((d) => {
      d.parts.push({
        id: uid('part'),
        title: `Part ${d.parts.length + 1}`,
        instructions: '',
        passage: d.module === 'reading' ? { title: '', html: '<p></p>' } : undefined,
        groups: [],
      });
    });
    setPartIdx(content.parts.length);
  }

  function addGroup(type: QuestionType) {
    mutate((d) => {
      d.parts[partIdx].groups.push({
        id: uid('grp'),
        type,
        heading: '',
        instructions: '',
        questions: [],
        ...(FAMILY_OF[type] === 'bank' ? { bank: [{ label: 'A', text: '' }, { label: 'B', text: '' }] } : {}),
        ...(FAMILY_OF[type] === 'gap' ? { bodyHtml: '' } : {}),
      });
    });
  }

  function addQuestion(gi: number) {
    mutate((d) => {
      const g = d.parts[partIdx].groups[gi];
      const type = g.type;
      const nextNumber = (Math.max(0, ...d.parts.flatMap((p) => p.groups.flatMap((x) => x.questions.map((q) => q.number)))) || 0) + 1;
      const q: Question = { id: uid('q'), number: nextNumber, prompt: '', answers: [''], points: 1 };
      if (type === 'multiple-choice' || type === 'multiple-choice-multi') {
        q.options = ['A', 'B', 'C', 'D'].map((label) => ({ label, text: '' }));
      }
      if (type === 'writing-task') { q.minWords = 250; q.answers = []; }
      if (type === 'multiple-choice-cloze') q.options = ['A', 'B', 'C', 'D'].map((label) => ({ label, text: '' }));
      if (type === 'error-correction') {
        q.fields = [
          { key: 'mistake', label: 'Mistake', answers: [] },
          { key: 'correction', label: 'Correction', answers: [] },
        ];
        q.answers = [];
      }
      if (type === 'sentence-transformation') { q.minWords = 3; q.maxWords = 8; }
      g.questions.push(q);
    });
  }

  return (
    <div className="px-[34px] py-[30px] max-w-[1280px]">
      <div className="flex items-start justify-between gap-[20px] mb-[22px]">
        <div className="flex-1 min-w-0">
          <input
            value={content.title}
            onChange={(e) => mutate((d) => { d.title = e.target.value; })}
            className="text-[30px] font-semibold w-full border-b border-transparent focus:border-black outline-none"
          />
          <p className="text-[15px] text-[color:var(--paper-ink-3)] mt-[6px]">
            {counts} question{counts === 1 ? '' : 's'} · {points} mark{points === 1 ? '' : 's'} ·{' '}
            {scoringOf(content) === 'band'
              ? 'IELTS band'
              : `out of ${content.totalPoints || points} point${(content.totalPoints || points) === 1 ? '' : 's'}`} ·{' '}
            {content.parts.length} part{content.parts.length === 1 ? '' : 's'} ·{' '}
            <span className="capitalize">{testStatus}</span>
          </p>
        </div>
        <div className="flex items-center gap-[10px] shrink-0">
          <Link href={`/admin/preview/${testId}`} target="_blank"
                className="px-[16px] h-[42px] leading-[42px] border border-[color:var(--line-strong)] rounded-[3px] text-[16px]">
            Preview
          </Link>
          <button type="button" onClick={() => save()} disabled={saving}
                  className="px-[18px] h-[42px] border border-[color:var(--line-strong)] rounded-[3px] text-[16px] disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => save(testStatus === 'published' ? 'draft' : 'published')}
            className="px-[18px] h-[42px] text-white rounded-[3px] text-[16px]"
            style={{ background: testStatus === 'published' ? '#5e5e5e' : 'var(--brand)' }}
          >
            {testStatus === 'published' ? 'Unpublish' : 'Publish'}
          </button>
          <span className="px-[6px] text-[16px]">
            {canDelete && (
              <DeleteButton
                url={`/api/admin/tests/${testId}`}
                what={`the paper “${content.title}”`}
                redirectTo="/admin/tests"
              />
            )}
          </span>
        </div>
      </div>

      {message && <p className="mb-[16px] text-[16px] text-[#1f6b1f]">{message}</p>}

      {/* --------------------------- release ----------------------------- */}
      <div className="border border-[color:var(--line)] rounded-[6px] p-[18px] mb-[22px] grid gap-[14px] sm:grid-cols-3">
        <Field label="Who can see this paper">
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="admin-input">
            <option value="private">This organisation only</option>
            <option value="sitting">Hidden — opens only with a sitting code</option>
            <option value="suite">Hidden — opens only inside a full test</option>
            <option value="catalog">Public catalogue{isPlatformTenant ? '' : ' (shared with everyone)'}</option>
          </select>
        </Field>
        <Field label="Price in credits (0 = free)">
          <input type="number" min={0} value={priceCredits}
                 onChange={(e) => setPriceCredits(Number(e.target.value) || 0)}
                 className="admin-input" disabled={visibility !== 'catalog'} />
        </Field>
        <Field label="Description shown in the catalogue">
          <input value={content.description ?? ''} onChange={(e) => mutate((d) => { d.description = e.target.value; })}
                 className="admin-input" />
        </Field>
        <Field label="Answer explanations">
          <p className="text-[15px] text-[color:var(--paper-ink-3)] mb-[8px]">
            {explained.written} of {explained.possible} answers explain themselves.
            {explained.possible > explained.written
              ? ' Candidates see these on their review screen after handing in.'
              : ' Candidates see these on their review screen after handing in.'}
          </p>
          <button
            type="button"
            onClick={explainAnswers}
            disabled={explaining || explained.possible === 0}
            className="px-[16px] h-[42px] border border-[color:var(--line-strong)] rounded-[3px] text-[15px] disabled:opacity-50"
          >
            {explaining
              ? 'Starting…'
              : explained.written >= explained.possible && explained.possible > 0
                ? 'Rewrite the explanations'
                : 'Write the missing explanations'}
          </button>
          {explainNote && <p className="text-[15px] mt-[8px]">{explainNote}</p>}
        </Field>

        <Field label="How this paper is marked (optional)">
          <textarea
            className="admin-input h-[74px]"
            placeholder="Taken from the answer key when one is uploaded: what each criterion is worth, how spelling is treated…"
            value={content.markingNotes ?? ''}
            onChange={(e) => mutate((d) => {
              const text = e.target.value;
              if (text.trim()) d.markingNotes = text; else delete d.markingNotes;
            })}
          />
        </Field>
        <Field label="Folder">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} className="admin-input"
                 placeholder="Cambridge IELTS 15 · Đề HSG 2024 · Mocks" />
        </Field>
        <label className="flex items-start gap-[10px] text-[15px] sm:col-span-2">
          <input type="checkbox" checked={bank} onChange={(e) => setBank(e.target.checked)} className="mt-[4px]" />
          <span>
            <span className="font-semibold">Keep this paper in the bank.</span>{' '}
            Full tests can then be built out of it at random — for a whole class, or for one candidate
            who asks for something to sit.
          </span>
        </label>
        {isPlatformTenant && (
          <label className="flex items-start gap-[10px] text-[15px] sm:col-span-3">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-[4px]" />
            <span>
              <span className="font-semibold">Share it in the Testora library.</span>{' '}
              Every organisation on the platform can then copy this paper into its own bank. They get
              a copy of their own, so editing or deleting this one later does not disturb them.
            </span>
          </label>
        )}
      </div>

      {/* --------------------------- pre-flight -------------------------- */}
      {report && (report.blocking.length > 0 || report.advisory.length > 0) && (
        <div
          className="border rounded-[6px] p-[18px] mb-[22px]"
          style={report.blocking.length
            ? { background: '#FDF2F3', borderColor: '#F0C4C9' }
            : { background: '#FFFCF0', borderColor: '#EFE3B0' }}
        >
          <p className="text-[17px] font-semibold mb-[10px]">
            {report.blocking.length
              ? `${report.blocking.length} thing${report.blocking.length === 1 ? '' : 's'} to fix before this paper can be sat`
              : `Ready to sit — ${report.advisory.length} thing${report.advisory.length === 1 ? '' : 's'} worth a look`}
            {checking && <span className="ml-[10px] text-[15px] font-normal opacity-70">checking…</span>}
          </p>
          <ul className="list-disc pl-[22px] space-y-[6px] text-[16px]">
            {report.blocking.map((problem, i) => (
              <li key={`b${i}`}>
                {problem.message}
                {problem.numbers?.length ? (
                  <button
                    type="button"
                    className="ml-[8px] underline text-[15px]"
                    onClick={() => {
                      const first = problem.numbers![0];
                      const at = content.parts.findIndex((p) => p.groups
                        .some((g) => g.questions.some((q) => q.number === first)));
                      if (at >= 0) setPartIdx(at);
                    }}
                  >
                    go to question {problem.numbers[0]}
                  </button>
                ) : null}
              </li>
            ))}
            {report.advisory.map((problem, i) => (
              <li key={`a${i}`} className="text-[color:var(--paper-ink-2)]">{problem.message}</li>
            ))}
          </ul>
        </div>
      )}
      {report && report.blocking.length === 0 && report.advisory.length === 0 && (
        <p className="text-[16px] mb-[22px]" style={{ color: 'var(--good)' }}>
          Checked: nothing wrong with this paper.
        </p>
      )}

      {/* ------------------------- paper settings ------------------------ */}
      <div className="grid gap-[14px] sm:grid-cols-4 mb-[26px]">
        <Field label="Module">
          <select value={content.module} onChange={(e) => mutate((d) => { d.module = e.target.value as ExamContent['module']; })}
                  className="admin-input">
            <option value="reading">Reading</option>
            <option value="listening">Listening</option>
            <option value="writing">Writing</option>
            <option value="mixed">Mixed (whole paper)</option>
          </select>
        </Field>
        <Field label="Variant">
          <select value={content.variant ?? 'academic'} onChange={(e) => mutate((d) => { d.variant = e.target.value as 'academic' | 'general'; })}
                  className="admin-input">
            <option value="academic">Academic</option>
            <option value="general">General Training</option>
            <option value="school">School / national paper</option>
          </select>
        </Field>
        <Field label="Reported as">
          <select
            value={scoringOf(content)}
            onChange={(e) => mutate((d) => { d.scoring = e.target.value as 'band' | 'points'; })}
            className="admin-input"
          >
            <option value="points">Points — out of the paper&apos;s own total</option>
            <option value="band">IELTS band (0–9)</option>
          </select>
        </Field>
        {scoringOf(content) === 'points' && (
          <Field label="Total printed on the paper (0 = the marks themselves)">
            <input
              type="number" min={0} step="0.5" className="admin-input"
              value={content.totalPoints ?? 0}
              onChange={(e) => mutate((d) => { d.totalPoints = Number(e.target.value) || undefined; })}
            />
          </Field>
        )}
        <Field label="Duration (minutes) — 0 for no time limit">
          <input type="number" min={0} value={content.durationMinutes}
                 onChange={(e) => mutate((d) => { d.durationMinutes = Number(e.target.value); })}
                 className="admin-input" />
        </Field>
        <Field label="Renumbering">
          <button type="button" onClick={() => setContent((c) => renumber(JSON.parse(JSON.stringify(c))))}
                  className="admin-input text-left">
            Renumber all questions
          </button>
        </Field>
      </div>

      {/* ------------------------------ parts ---------------------------- */}
      <div className="flex items-center gap-[8px] border-b border-[color:var(--line)] mb-[22px] overflow-x-auto">
        {content.parts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPartIdx(i)}
            className={`px-[16px] py-[10px] text-[17px] whitespace-nowrap ${
              i === partIdx ? 'border-b-2 border-black font-semibold' : 'text-[color:var(--paper-ink-3)]'
            }`}
          >
            {p.title || `Part ${i + 1}`}
          </button>
        ))}
        <button type="button" onClick={addPart} className="px-[14px] py-[10px] text-[17px] underline whitespace-nowrap">
          + Add part
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => { setJsonText(JSON.stringify(content, null, 2)); setJsonMode((v) => !v); }}
                className="px-[14px] py-[10px] text-[16px] underline whitespace-nowrap">
          {jsonMode ? 'Back to editor' : 'Edit JSON'}
        </button>
      </div>

      {jsonMode ? (
        <div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full h-[560px] font-mono text-[13px] border border-[color:var(--line-strong)] p-[12px]"
            spellCheck={false}
          />
          <button
            type="button"
            className="mt-[12px] px-[18px] h-[42px] border border-[color:var(--line-strong)] rounded-[3px]"
            onClick={() => {
              try { setContent(JSON.parse(jsonText)); setJsonMode(false); setMessage('JSON applied — remember to save.'); }
              catch (err) { setMessage(`Invalid JSON: ${(err as Error).message}`); }
            }}
          >
            Apply JSON
          </button>
        </div>
      ) : !part ? (
        <p className="text-[18px] text-[color:var(--paper-ink-3)]">Add a part to begin.</p>
      ) : (
        <>
          <div className="grid gap-[14px] sm:grid-cols-3 mb-[22px]">
            <Field label="Section (optional)">
              <input value={part.section ?? ''} placeholder="SECTION B: LEXICO-GRAMMAR"
                     onChange={(e) => mutate((d) => { d.parts[partIdx].section = e.target.value; })}
                     className="admin-input" />
            </Field>
            <Field label="Part title">
              <input value={part.title} onChange={(e) => mutate((d) => { d.parts[partIdx].title = e.target.value; })}
                     className="admin-input" />
            </Field>
            <Field label="Instruction line (shown in the banner)">
              <input value={part.instructions} onChange={(e) => mutate((d) => { d.parts[partIdx].instructions = e.target.value; })}
                     className="admin-input" />
            </Field>
          </div>

          {/*
            * A listening paper needs its recording before it can go live, and
            * papers come both ways: usually one tape for the whole paper, and
            * sometimes a separate file per section. The paper's tape is offered
            * first because it is the common case; a section's own file, when it
            * has one, is what that section plays instead.
            */}
          {(content.module === 'listening' || isListeningPart(part) || !!part.audioUrl || !!content.audioUrl) && (
            <>
              <AudioUploader
                testId={testId}
                partId="paper"
                partTitle="the whole paper"
                covers={listeningParts(content).map((p) => p.title)}
                audioUrl={content.audioUrl}
                playOnce={content.audioPlayOnce !== false}
                onPlayOnce={(value) => mutate((d) => { d.audioPlayOnce = value; })}
                onAudioUrl={(url) => mutate((d) => {
                  if (url) d.audioUrl = url; else delete d.audioUrl;
                })}
              />
              <AudioUploader
                testId={testId}
                partId={part.id}
                partTitle={part.section ? `${part.section} · ${part.title}` : part.title}
                audioUrl={part.audioUrl}
                optional={!!content.audioUrl}
                playOnce={part.audioPlayOnce !== false}
                onPlayOnce={(value) => mutate((d) => { d.parts[partIdx].audioPlayOnce = value; })}
                onAudioUrl={(url) => mutate((d) => {
                  if (url) {
                    d.parts[partIdx].audioUrl = url;
                    d.parts[partIdx].listening = true;
                  } else {
                    delete d.parts[partIdx].audioUrl;
                  }
                })}
              />
            </>
          )}

          {content.module !== 'writing' && (
            <div className="mb-[26px]">
              <Field label="Passage title">
                <input value={part.passage?.title ?? ''}
                       onChange={(e) => mutate((d) => {
                         d.parts[partIdx].passage = { ...(d.parts[partIdx].passage ?? { html: '' }), title: e.target.value };
                       })}
                       className="admin-input mb-[10px]" />
              </Field>
              <Field label="Passage HTML — one <p> per paragraph; add data-ref=&quot;A&quot; for lettered paragraphs">
                <textarea
                  value={part.passage?.html ?? ''}
                  onChange={(e) => mutate((d) => {
                    d.parts[partIdx].passage = { ...(d.parts[partIdx].passage ?? {}), html: e.target.value };
                  })}
                  className="w-full h-[260px] font-mono text-[13px] border border-[color:var(--line-strong)] p-[12px]"
                  spellCheck={false}
                />
              </Field>
            </div>
          )}

          {/* ---------------------------- groups --------------------------- */}
          {part.groups.map((g, gi) => (
            <GroupEditor
              key={g.id}
              group={g}
              onChange={(fn) => mutate((d) => fn(d.parts[partIdx].groups[gi]))}
              onRemove={() => mutate((d) => { d.parts[partIdx].groups.splice(gi, 1); })}
              onAddQuestion={() => addQuestion(gi)}
            />
          ))}

          <div className="flex items-center gap-[10px] mt-[10px] flex-wrap">
            <span className="text-[16px] text-[color:var(--paper-ink-3)]">Add a question group:</span>
            <select
              className="admin-input w-auto"
              defaultValue=""
              onChange={(e) => { if (e.target.value) { addGroup(e.target.value as QuestionType); e.target.value = ''; } }}
            >
              <option value="">Choose a type…</option>
              <TypeOptions />
            </select>
            <button type="button" onClick={() => mutate((d) => { d.parts.splice(partIdx, 1); })}
                    className="ml-auto text-[16px] underline text-[#c4142e]">
              Delete this part
            </button>
          </div>
        </>
      )}

    </div>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[14px] font-semibold text-[color:var(--paper-ink-2)] mb-[6px]">{label}</span>
      {children}
    </label>
  );
}

function GroupEditor({
  group, onChange, onRemove, onAddQuestion,
}: {
  group: Group;
  onChange: (fn: (g: Group) => void) => void;
  onRemove: () => void;
  onAddQuestion: () => void;
}) {
  const family = FAMILY_OF[group.type];
  const fixed = FIXED_OPTIONS[group.type];

  return (
    <section className="border border-[color:var(--line)] rounded-[3px] p-[20px] mb-[18px]">
      <div className="flex items-center gap-[12px] mb-[16px] flex-wrap">
        <select
          value={group.type}
          onChange={(e) => onChange((g) => { g.type = e.target.value as QuestionType; })}
          className="admin-input w-auto font-semibold"
        >
          <TypeOptions />
        </select>
        <input
          value={group.heading ?? ''}
          placeholder="Questions 1–6"
          onChange={(e) => onChange((g) => { g.heading = e.target.value; })}
          className="admin-input w-[220px]"
        />
        <span className="text-[15px] text-[color:var(--paper-ink-3)]">{group.questions.length} question(s)</span>
        {(family === 'choice' || family === 'cloze') && (
          <label className="flex items-center gap-[6px] text-[14px]">
            Options
            <select
              value={group.optionLayout ?? 'auto'}
              onChange={(e) => onChange((g) => {
                g.optionLayout = e.target.value as 'auto' | 'row' | 'stack';
              })}
              className="admin-input w-auto"
            >
              <option value="auto">as the length suggests</option>
              <option value="row">across one line</option>
              <option value="stack">one per line</option>
            </select>
          </label>
        )}
        <button type="button" onClick={onRemove} className="ml-auto text-[15px] underline text-[#c4142e]">
          Remove group
        </button>
      </div>

      <Field label="Rubric (HTML allowed)">
        <textarea
          value={group.instructions ?? ''}
          onChange={(e) => onChange((g) => { g.instructions = e.target.value; })}
          className="admin-input h-[86px]"
          spellCheck={false}
        />
      </Field>

      {family === 'bank' && (
        <div className="mt-[16px]">
          <span className="block text-[14px] font-semibold text-[color:var(--paper-ink-2)] mb-[6px]">Option bank</span>
          {(group.bank ?? []).map((b, i) => (
            <div key={i} className="flex gap-[8px] mb-[6px]">
              <input value={b.label} onChange={(e) => onChange((g) => { g.bank![i].label = e.target.value; })}
                     className="admin-input w-[80px]" />
              <input value={b.text} onChange={(e) => onChange((g) => { g.bank![i].text = e.target.value; })}
                     className="admin-input flex-1" />
              <button type="button" onClick={() => onChange((g) => { g.bank!.splice(i, 1); })}
                      className="px-[12px] text-[15px] underline text-[#c4142e]">Remove</button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange((g) => {
              const n = (g.bank ?? []).length;
              const label = g.type === 'matching-headings' ? indexToRoman(n) : indexToLetter(n);
              (g.bank ??= []).push({ label, text: '' });
            })}
            className="text-[15px] underline mt-[4px]"
          >
            + Add option
          </button>
        </div>
      )}

      {family === 'gap' && (
        <div className="mt-[16px]">
          <Field label="Text block — write [[7]] where question 7's input should appear. Tables and lists are allowed.">
            <textarea
              value={group.bodyHtml ?? ''}
              onChange={(e) => onChange((g) => { g.bodyHtml = e.target.value; })}
              className="admin-input h-[180px] font-mono text-[13px]"
              spellCheck={false}
            />
          </Field>
        </div>
      )}

      {family === 'fields' && (
        <div className="mt-[16px]">
          <Field label="Passage with numbered lines (HTML). The candidate reads it beside the table.">
            <textarea
              value={group.bodyHtml ?? ''}
              onChange={(e) => onChange((g) => { g.bodyHtml = e.target.value; })}
              className="admin-input h-[160px] font-mono text-[13px]"
              spellCheck={false}
            />
          </Field>
          <Field label="Table headings (comma separated)">
            <input
              value={(group.fieldColumns ?? ['No.', 'Mistake', 'Correction']).join(', ')}
              onChange={(e) => onChange((g) => { g.fieldColumns = e.target.value.split(',').map((x) => x.trim()); })}
              className="admin-input"
            />
          </Field>
        </div>
      )}

      {family === 'cloze' && (
        <div className="mt-[16px]">
          <Field label="Passage with [[n]] at each blank. Each question carries its own four options.">
            <textarea
              value={group.bodyHtml ?? ''}
              onChange={(e) => onChange((g) => { g.bodyHtml = e.target.value; })}
              className="admin-input h-[200px] font-mono text-[13px]"
              spellCheck={false}
            />
          </Field>
        </div>
      )}

      {family === 'label' && (
        <div className="mt-[16px]">
          <Field label="Diagram image URL">
            <input value={group.imageUrl ?? ''} onChange={(e) => onChange((g) => { g.imageUrl = e.target.value; })}
                   className="admin-input" placeholder="/images/diagram-1.png" />
          </Field>
        </div>
      )}

      <div className="mt-[18px] space-y-[14px]">
        {group.questions.map((q, qi) => (
          <div key={q.id} className="border border-[color:var(--line)] rounded-[3px] p-[14px]">
            <div className="flex items-center gap-[10px] mb-[10px]">
              <input
                type="number"
                value={q.number}
                onChange={(e) => onChange((g) => { g.questions[qi].number = Number(e.target.value); })}
                className="admin-input w-[86px]"
              />
              <input
                value={q.prompt ?? ''}
                placeholder={family === 'gap' && group.bodyHtml ? 'Not needed — the gap lives in the text block' : 'Question text'}
                onChange={(e) => onChange((g) => { g.questions[qi].prompt = e.target.value; })}
                className="admin-input flex-1"
              />
              <button type="button" onClick={() => onChange((g) => { g.questions.splice(qi, 1); })}
                      className="px-[10px] text-[15px] underline text-[#c4142e]">Delete</button>
            </div>

            {family === 'cloze' && (
              <div className="ml-[96px] space-y-[6px] mb-[10px]">
                {(q.options ?? []).map((o, oi) => (
                  <div key={oi} className="flex gap-[8px]">
                    <input value={o.label} onChange={(e) => onChange((g) => { g.questions[qi].options![oi].label = e.target.value; })}
                           className="admin-input w-[70px]" />
                    <input value={o.text} onChange={(e) => onChange((g) => { g.questions[qi].options![oi].text = e.target.value; })}
                           className="admin-input flex-1" />
                    <button type="button" onClick={() => onChange((g) => { g.questions[qi].options!.splice(oi, 1); })}
                            className="px-[10px] text-[15px] underline text-[#c4142e]">×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onChange((g) => {
                    const opts = (g.questions[qi].options ??= []);
                    opts.push({ label: indexToLetter(opts.length), text: '' });
                  })}
                  className="text-[15px] underline"
                >
                  + Add option
                </button>
              </div>
            )}

            {family === 'fields' && (
              <div className="ml-[96px] space-y-[6px] mb-[10px]">
                {(q.fields ?? []).map((f, fi) => (
                  <div key={fi} className="flex gap-[8px] items-center">
                    <span className="w-[110px] text-[14px] font-semibold">{f.label ?? f.key}</span>
                    <input
                      value={f.answers.join(' | ')}
                      placeholder="accepted answers, separated by |"
                      onChange={(e) => onChange((g) => {
                        g.questions[qi].fields![fi].answers = e.target.value.split('|').map((x) => x.trim()).filter(Boolean);
                      })}
                      className="admin-input flex-1"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onChange((g) => {
                    const fields = (g.questions[qi].fields ??= []);
                    fields.push({ key: `f${fields.length + 1}`, label: `Field ${fields.length + 1}`, answers: [] });
                  })}
                  className="text-[15px] underline"
                >
                  + Add input
                </button>
              </div>
            )}

            {family === 'choice' && !fixed && (
              <div className="ml-[96px] space-y-[6px] mb-[10px]">
                {(q.options ?? []).map((o, oi) => (
                  <div key={oi} className="flex gap-[8px]">
                    <input value={o.label} onChange={(e) => onChange((g) => { g.questions[qi].options![oi].label = e.target.value; })}
                           className="admin-input w-[70px]" />
                    <input value={o.text} onChange={(e) => onChange((g) => { g.questions[qi].options![oi].text = e.target.value; })}
                           className="admin-input flex-1" />
                    <button type="button" onClick={() => onChange((g) => { g.questions[qi].options!.splice(oi, 1); })}
                            className="px-[10px] text-[15px] underline text-[#c4142e]">×</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onChange((g) => {
                    const opts = (g.questions[qi].options ??= []);
                    opts.push({ label: indexToLetter(opts.length), text: '' });
                  })}
                  className="text-[15px] underline"
                >
                  + Add option
                </button>
              </div>
            )}

            <div className="flex gap-[10px] flex-wrap items-end">
              <label className={`flex-1 min-w-[260px] ${family === 'fields' ? 'hidden' : ''}`}>
                <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">
                  Accepted answers (one per line; use | inside a line for alternatives)
                  {/* An answer the model wrote is flagged until somebody edits it. */}
                  {q.markingNote?.includes('supplied by AI') && (
                    <span className="ml-[8px] font-normal px-[6px] py-[1px] rounded-[3px] text-[12px]"
                          style={{ background: '#FFF4D6', border: '1px solid #E9CE7B' }}>
                      written by AI — check it
                    </span>
                  )}
                </span>
                <textarea
                  value={q.answers.join('\n')}
                  onChange={(e) => onChange((g) => {
                    g.questions[qi].answers = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                    // Edited by a person, so it is no longer the model's answer.
                    const note = g.questions[qi].markingNote;
                    if (note?.includes('supplied by AI')) {
                      const rest = note.replace(/Answer supplied by AI — please check\.?/g, '').trim();
                      g.questions[qi].markingNote = rest || undefined;
                    }
                  })}
                  className="admin-input h-[70px] font-mono text-[13px]"
                  spellCheck={false}
                />
              </label>
              {group.type === 'word-formation' && (
                <label className="w-[170px]">
                  <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Root word (CAPITALS)</span>
                  <input value={q.rootWord ?? ''}
                         onChange={(e) => onChange((g) => { g.questions[qi].rootWord = e.target.value.toUpperCase(); })}
                         className="admin-input" />
                </label>
              )}
              {family === 'transform' && (
                <>
                  <label className="w-[170px]">
                    <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Key word</span>
                    <input value={q.keyWord ?? ''}
                           onChange={(e) => onChange((g) => { g.questions[qi].keyWord = e.target.value.toUpperCase(); })}
                           className="admin-input" />
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Min words</span>
                    <input type="number" value={q.minWords ?? 3}
                           onChange={(e) => onChange((g) => { g.questions[qi].minWords = Number(e.target.value); })}
                           className="admin-input" />
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Max words</span>
                    <input type="number" value={q.maxWords ?? 8}
                           onChange={(e) => onChange((g) => { g.questions[qi].maxWords = Number(e.target.value); })}
                           className="admin-input" />
                  </label>
                </>
              )}
              <label className="w-[110px]">
                <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Points</span>
                <input type="number" min={0} step="0.5" value={q.points ?? 1}
                       onChange={(e) => onChange((g) => { g.questions[qi].points = Number(e.target.value); })}
                       className="admin-input" />
              </label>
              {family === 'gap' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Max words</span>
                  <input type="number" value={q.maxWords ?? ''}
                         onChange={(e) => onChange((g) => { g.questions[qi].maxWords = e.target.value ? Number(e.target.value) : undefined; })}
                         className="admin-input" />
                </label>
              )}
              {group.type === 'multiple-choice-multi' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Choose how many</span>
                  <input type="number" value={q.selectCount ?? 2}
                         onChange={(e) => onChange((g) => { g.questions[qi].selectCount = Number(e.target.value); })}
                         className="admin-input" />
                </label>
              )}
              {family === 'essay' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[color:var(--paper-ink-2)] mb-[4px]">Minimum words</span>
                  <input type="number" value={q.minWords ?? 250}
                         onChange={(e) => onChange((g) => { g.questions[qi].minWords = Number(e.target.value); })}
                         className="admin-input" />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={onAddQuestion} className="mt-[14px] text-[16px] underline">
        + Add question
      </button>
    </section>
  );
}
