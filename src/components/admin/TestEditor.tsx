'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ExamContent, FAMILY_OF, FIXED_OPTIONS, Group, Part, QUESTION_TYPE_LABEL, Question, QuestionType,
  TYPE_GROUPS, emptyContent, renumber, totalPoints, totalQuestions,
} from '@/types/exam';
import { indexToLetter, indexToRoman, uid } from '@/lib/utils';

const TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];

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
}: {
  testId: string;
  initial: ExamContent;
  status: string;
  visibility: string;
  priceCredits: number;
  isPlatformTenant: boolean;
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

  const part: Part | undefined = content.parts[partIdx];

  const mutate = useCallback((fn: (draft: ExamContent) => void) => {
    setContent((prev) => {
      const next: ExamContent = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
  }, []);

  async function save(nextStatus?: string) {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/admin/tests/${testId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, visibility, priceCredits, ...(nextStatus ? { status: nextStatus } : {}) }),
    });
    setSaving(false);
    if (!res.ok) { setMessage((await res.json()).error ?? 'Save failed'); return; }
    if (nextStatus) setTestStatus(nextStatus);
    setMessage('Saved.');
    setTimeout(() => setMessage(null), 2500);
  }

  const counts = useMemo(() => totalQuestions(content), [content]);
  const points = useMemo(() => totalPoints(content), [content]);

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
          <p className="text-[15px] text-[#5e5e5e] mt-[6px]">
            {counts} question{counts === 1 ? '' : 's'} · {points} point{points === 1 ? '' : 's'} ·{' '}
            {content.parts.length} part{content.parts.length === 1 ? '' : 's'} ·{' '}
            <span className="capitalize">{testStatus}</span>
          </p>
        </div>
        <div className="flex items-center gap-[10px] shrink-0">
          <Link href={`/admin/preview/${testId}`} target="_blank"
                className="px-[16px] h-[42px] leading-[42px] border border-[#8f8f8f] rounded-[3px] text-[16px]">
            Preview
          </Link>
          <button type="button" onClick={() => save()} disabled={saving}
                  className="px-[18px] h-[42px] border border-[#8f8f8f] rounded-[3px] text-[16px] disabled:opacity-60">
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
        </div>
      </div>

      {message && <p className="mb-[16px] text-[16px] text-[#1f6b1f]">{message}</p>}

      {/* --------------------------- release ----------------------------- */}
      <div className="border border-[#e3e3e3] rounded-[6px] p-[18px] mb-[22px] grid gap-[14px] sm:grid-cols-3">
        <Field label="Who can see this paper">
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="admin-input">
            <option value="private">This organisation only</option>
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
      </div>

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
        <Field label="Duration (minutes)">
          <input type="number" min={1} value={content.durationMinutes}
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
      <div className="flex items-center gap-[8px] border-b border-[#dcdcdc] mb-[22px] overflow-x-auto">
        {content.parts.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPartIdx(i)}
            className={`px-[16px] py-[10px] text-[17px] whitespace-nowrap ${
              i === partIdx ? 'border-b-2 border-black font-semibold' : 'text-[#5e5e5e]'
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
            className="w-full h-[560px] font-mono text-[13px] border border-[#c1c1c1] p-[12px]"
            spellCheck={false}
          />
          <button
            type="button"
            className="mt-[12px] px-[18px] h-[42px] border border-[#8f8f8f] rounded-[3px]"
            onClick={() => {
              try { setContent(JSON.parse(jsonText)); setJsonMode(false); setMessage('JSON applied — remember to save.'); }
              catch (err) { setMessage(`Invalid JSON: ${(err as Error).message}`); }
            }}
          >
            Apply JSON
          </button>
        </div>
      ) : !part ? (
        <p className="text-[18px] text-[#5e5e5e]">Add a part to begin.</p>
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

          {content.module === 'listening' && (
            <Field label="Audio URL (put files in /public/audio)">
              <input value={part.audioUrl ?? ''} placeholder="/audio/section-1.mp3"
                     onChange={(e) => mutate((d) => { d.parts[partIdx].audioUrl = e.target.value; })}
                     className="admin-input mb-[22px]" />
            </Field>
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
                  className="w-full h-[260px] font-mono text-[13px] border border-[#c1c1c1] p-[12px]"
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
            <span className="text-[16px] text-[#5e5e5e]">Add a question group:</span>
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
      <span className="block text-[14px] font-semibold text-[#3d3d3d] mb-[6px]">{label}</span>
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
    <section className="border border-[#dcdcdc] rounded-[3px] p-[20px] mb-[18px]">
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
        <span className="text-[15px] text-[#5e5e5e]">{group.questions.length} question(s)</span>
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
          <span className="block text-[14px] font-semibold text-[#3d3d3d] mb-[6px]">Option bank</span>
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
          <div key={q.id} className="border border-[#ececec] rounded-[3px] p-[14px]">
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
                <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">
                  Accepted answers (one per line; use | inside a line for alternatives)
                </span>
                <textarea
                  value={q.answers.join('\n')}
                  onChange={(e) => onChange((g) => {
                    g.questions[qi].answers = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                  })}
                  className="admin-input h-[70px] font-mono text-[13px]"
                  spellCheck={false}
                />
              </label>
              {group.type === 'word-formation' && (
                <label className="w-[170px]">
                  <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Root word (CAPITALS)</span>
                  <input value={q.rootWord ?? ''}
                         onChange={(e) => onChange((g) => { g.questions[qi].rootWord = e.target.value.toUpperCase(); })}
                         className="admin-input" />
                </label>
              )}
              {family === 'transform' && (
                <>
                  <label className="w-[170px]">
                    <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Key word</span>
                    <input value={q.keyWord ?? ''}
                           onChange={(e) => onChange((g) => { g.questions[qi].keyWord = e.target.value.toUpperCase(); })}
                           className="admin-input" />
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Min words</span>
                    <input type="number" value={q.minWords ?? 3}
                           onChange={(e) => onChange((g) => { g.questions[qi].minWords = Number(e.target.value); })}
                           className="admin-input" />
                  </label>
                  <label className="w-[120px]">
                    <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Max words</span>
                    <input type="number" value={q.maxWords ?? 8}
                           onChange={(e) => onChange((g) => { g.questions[qi].maxWords = Number(e.target.value); })}
                           className="admin-input" />
                  </label>
                </>
              )}
              <label className="w-[110px]">
                <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Points</span>
                <input type="number" min={0} step="0.5" value={q.points ?? 1}
                       onChange={(e) => onChange((g) => { g.questions[qi].points = Number(e.target.value); })}
                       className="admin-input" />
              </label>
              {family === 'gap' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Max words</span>
                  <input type="number" value={q.maxWords ?? ''}
                         onChange={(e) => onChange((g) => { g.questions[qi].maxWords = e.target.value ? Number(e.target.value) : undefined; })}
                         className="admin-input" />
                </label>
              )}
              {group.type === 'multiple-choice-multi' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Choose how many</span>
                  <input type="number" value={q.selectCount ?? 2}
                         onChange={(e) => onChange((g) => { g.questions[qi].selectCount = Number(e.target.value); })}
                         className="admin-input" />
                </label>
              )}
              {family === 'essay' && (
                <label className="w-[150px]">
                  <span className="block text-[13px] font-semibold text-[#3d3d3d] mb-[4px]">Minimum words</span>
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
