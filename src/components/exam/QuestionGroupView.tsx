'use client';

import {
  FAMILY_OF, FIXED_OPTIONS, Group, Question, QuestionField, groupRangeLabel, isTemplated,
} from '@/types/exam';
import { AnswerMap, AnswerValue } from '@/lib/grading';
import { asHtml, countWords } from '@/lib/utils';
import { hasMarkup, sanitizeInline } from '@/lib/sanitize';
import GapBody from './GapBody';
import QuestionNumber from './QuestionNumber';
import { FlagIcon } from '../ui/Icons';

export type Answers = AnswerMap;

export interface GroupProps {
  group: Group;
  answers: Answers;
  flags: string[];
  activeQuestion: number | null;
  onAnswer: (questionId: string, value: AnswerValue) => void;
  onFocusQuestion: (n: number) => void;
  onToggleFlag: (questionId: string) => void;
  /** Anti-cheat: paste into answer inputs is refused when set. */
  blockPaste?: boolean;
}

export default function QuestionGroupView(props: GroupProps) {
  const { group } = props;
  const family = FAMILY_OF[group.type];

  return (
    <section className="mb-[52px]" data-group={group.id}>
      <h2 className="text-[21px] font-bold mb-[14px]">{group.heading ?? groupRangeLabel(group)}</h2>

      {group.instructions && (
        <div className="exam-body mb-[26px]" dangerouslySetInnerHTML={{ __html: asHtml(group.instructions) }} />
      )}

      {group.bank && family === 'bank' && <OptionBank group={group} />}

      {family === 'choice' && <ChoiceGroup {...props} />}
      {family === 'bank' && <BankGroup {...props} />}
      {family === 'gap' && <GapGroup {...props} />}
      {family === 'cloze' && <ClozeGroup {...props} />}
      {family === 'fields' && <FieldsGroup {...props} />}
      {family === 'transform' && <TransformGroup {...props} />}
      {family === 'label' && <LabelGroup {...props} />}
      {family === 'essay' && <EssayGroup {...props} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function noPaste(blockPaste?: boolean) {
  return blockPaste
    ? { onPaste: (e: React.ClipboardEvent) => e.preventDefault(), onDrop: (e: React.DragEvent) => e.preventDefault() }
    : {};
}

function FlagButton({ flagged, onToggle, number, top = 6 }: {
  flagged: boolean; onToggle: () => void; number: number; top?: number;
}) {
  return (
    <button
      type="button"
      aria-label={flagged ? `Remove review flag from question ${number}` : `Flag question ${number} for review`}
      aria-pressed={flagged}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{ marginTop: top }}
      className={`shrink-0 p-[4px] focus-ring transition-opacity ${
        flagged
          ? 'opacity-100 text-[color:var(--bad)]'
          : 'opacity-0 group-hover:opacity-100 focus:opacity-100 text-[#b5b5b5] hover:text-[#5e5e5e]'
      }`}
    >
      <FlagIcon />
    </button>
  );
}

function OptionBank({ group }: { group: Group }) {
  const title =
    group.type === 'matching-headings' ? 'List of Headings'
      : group.type === 'gapped-text' ? 'Missing sentences'
        : 'List of Options';
  return (
    <div className="border border-[#bdbdbd] mb-[26px]">
      <div className="border-b border-[#bdbdbd] px-[16px] py-[9px] text-[17px] font-bold" style={{ background: 'var(--banner)' }}>
        {title}
      </div>
      <ul className="px-[16px] py-[12px] exam-body">
        {group.bank!.map((b) => (
          <li key={b.label} className="flex gap-[14px] py-[3px]">
            <span className="font-bold min-w-[34px]">{b.label}</span>
            <Rich text={b.text} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextInput({
  q, value, width, onAnswer, onFocus, blockPaste, placeholder, ariaLabel,
}: {
  q: Question; value: string; width: number;
  onAnswer: (v: string) => void; onFocus: () => void;
  blockPaste?: boolean; placeholder?: string; ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel ?? `Answer for question ${q.number}`}
      className="exam-input h-[40px] text-[17px]"
      style={{ width }}
      data-answered={!!value}
      value={value}
      placeholder={placeholder}
      onFocus={onFocus}
      onChange={(e) => onAnswer(e.target.value)}
      autoComplete="off"
      spellCheck={false}
      {...noPaste(blockPaste)}
    />
  );
}

/**
 * A question stem or an option may carry the paper's own formatting — usually an
 * underline under the word being tested. Rendered as HTML when it does, and as
 * plain text when it does not, so nothing can smuggle markup through.
 */
function Rich({ text, className }: { text?: string; className?: string }) {
  if (!text) return null;
  if (!hasMarkup(text)) return <span className={className}>{text}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: sanitizeInline(text) }} />;
}

const asText = (v: AnswerValue | undefined): string => (typeof v === 'string' ? v : '');

/** Which question numbers the group's text block actually has a gap for. */
function gapNumbers(html: string | undefined): Set<number> {
  const found = new Set<number>();
  for (const m of (html ?? '').matchAll(/\[\[(\d{1,3})\]\]/g)) found.add(Number(m[1]));
  return found;
}

/**
 * Questions the text block has no gap for. They are still asked — underneath
 * the block — because an unanswerable question is worse than an ugly one.
 */
function orphansOf(group: Group): Question[] {
  if (!isTemplated(group)) return group.questions;
  const gaps = gapNumbers(group.bodyHtml);
  return group.questions.filter((q) => !gaps.has(q.number));
}

/** A text block that has no gaps at all is still worth showing as reading. */
function PlainBlock({ html }: { html: string }) {
  return <div className="exam-body mb-[26px]" dangerouslySetInnerHTML={{ __html: asHtml(html) }} />;
}
const asMap = (v: AnswerValue | undefined): Record<string, string> =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/* ------------------------------------------------------------------ */
/* choice                                                              */
/* ------------------------------------------------------------------ */

/**
 * Papers print options either down the page or across one line. `row` copies
 * the printed layout; `auto` decides from how long the options are, because a
 * row of long options is unreadable.
 */
function optionsInRow(group: Group): boolean {
  if (group.optionLayout === 'row') return true;
  if (group.optionLayout === 'stack') return false;
  const texts = group.questions.flatMap((q) => (q.options ?? []).map((o) => o.text ?? ''));
  if (texts.length < 2) return false;
  const longest = Math.max(...texts.map((t) => t.replace(/<[^>]+>/g, '').length));
  return longest <= 24;
}

function ChoiceGroup({ group, answers, flags, activeQuestion, onAnswer, onFocusQuestion, onToggleFlag }: GroupProps) {
  const fixed = FIXED_OPTIONS[group.type];
  const multi = group.type === 'multiple-choice-multi';
  const row = optionsInRow(group);

  return (
    <div className="space-y-[40px]">
      {group.questions.map((q) => {
        const options = fixed ? fixed.map((t) => ({ label: t, text: t })) : q.options ?? [];
        const current = answers[q.id];
        const selected = Array.isArray(current) ? current : typeof current === 'string' && current ? [current] : [];

        return (
          <div key={q.id} data-question={q.number}>
            <div className="group flex items-start gap-[12px]" onClick={() => onFocusQuestion(q.number)}>
              <QuestionNumber n={q.number} active={activeQuestion === q.number} />
              <Rich text={q.prompt} className="exam-body flex-1 !mb-0" />
              <FlagButton number={q.number} flagged={flags.includes(q.id)} onToggle={() => onToggleFlag(q.id)} />
            </div>
            {/* No options came through the parse: a typed answer beats no answer. */}
            {options.length === 0 && (
              <div className="mt-[16px] ml-[46px]">
                <TextInput
                  q={q} value={asText(current)} width={280}
                  onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(q.number)}
                />
              </div>
            )}
            <div className={
              row
                ? 'mt-[16px] ml-[46px] flex flex-wrap gap-x-[40px] gap-y-[14px]'
                : `mt-[22px] ml-[46px] ${fixed ? 'space-y-[30px]' : 'space-y-[22px]'}`
            }>
              {options.map((opt) => {
                const checked = selected.includes(opt.label);
                return (
                  // `relative` matters: the radio is visually hidden with
                  // `sr-only` (absolute + clip), so without a positioned
                  // ancestor its position resolves against a container further
                  // up the tree. Focusing it then scrolls that container — the
                  // whole exam — instead of the option's own pane.
                  <label key={opt.label} className="relative flex items-start gap-[14px] cursor-pointer exam-body !mb-0 w-fit">
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={q.id}
                      value={opt.label}
                      className="sr-only"
                      checked={checked}
                      onChange={() => {
                        onFocusQuestion(q.number);
                        if (!multi) { onAnswer(q.id, opt.label); return; }
                        const limit = q.selectCount ?? 2;
                        onAnswer(q.id, checked
                          ? selected.filter((s) => s !== opt.label)
                          : [...selected, opt.label].slice(-limit));
                      }}
                    />
                    <span className={multi ? 'check-box mt-[6px]' : 'radio-dot mt-[6px]'} data-checked={checked} aria-hidden="true">
                      {multi && checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" stroke="#fff" strokeWidth="3.4" fill="none">
                          <path d="M4 12.5 9.5 18 20 6" />
                        </svg>
                      )}
                    </span>
                    <span>
                      {!fixed && <span className="font-bold mr-[10px]">{opt.label}</span>}
                      <Rich text={opt.text} />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* bank — a shared option list, either per row or inside a passage      */
/* ------------------------------------------------------------------ */

function BankSelect({ group, q, value, onAnswer, onFocus }: {
  group: Group; q: Question; value: string; onAnswer: (v: string) => void; onFocus: () => void;
}) {
  // A matching task with no list to match against: type the answer instead.
  if (!group.bank?.length) {
    return (
      <TextInput q={q} value={value} width={220} onAnswer={onAnswer} onFocus={onFocus} />
    );
  }
  return (
    <select
      aria-label={`Answer for question ${q.number}`}
      className="exam-input h-[42px] min-w-[104px] text-[17px]"
      value={value}
      data-answered={!!value}
      onFocus={onFocus}
      onChange={(e) => onAnswer(e.target.value)}
    >
      <option value="">—</option>
      {(group.bank ?? []).map((b) => <option key={b.label} value={b.label}>{b.label}</option>)}
    </select>
  );
}

function BankGroup(props: GroupProps) {
  const { group, answers, flags, activeQuestion, onAnswer, onFocusQuestion, onToggleFlag } = props;
  const templated = isTemplated(group);
  const byNumber = new Map(group.questions.map((q) => [q.number, q]));
  const orphans = orphansOf(group);

  return (
    <>
      {templated ? (
        <GapBody
          html={group.bodyHtml!}
          renderGap={(n) => {
            const q = byNumber.get(n);
            if (!q) return null;
            return (
              <span data-question={n} className="inline-flex items-center gap-[8px] align-baseline mx-[4px]">
                <QuestionNumber n={n} active={activeQuestion === n} />
                <BankSelect
                  group={group} q={q} value={asText(answers[q.id])}
                  onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(n)}
                />
              </span>
            );
          }}
        />
      ) : group.bodyHtml ? <PlainBlock html={group.bodyHtml} /> : null}

      {orphans.length > 0 && (
        <div className={`space-y-[26px] ${templated ? 'mt-[26px]' : ''}`}>
          {orphans.map((q) => (
            <div key={q.id} data-question={q.number} className="group flex items-start gap-[12px]">
              <QuestionNumber n={q.number} active={activeQuestion === q.number} />
              <div className="flex-1 flex items-center gap-[14px] flex-wrap">
                {q.prompt && <Rich text={q.prompt} className="exam-body !mb-0" />}
                <BankSelect
                  group={group} q={q} value={asText(answers[q.id])}
                  onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(q.number)}
                />
              </div>
              <FlagButton number={q.number} flagged={flags.includes(q.id)} onToggle={() => onToggleFlag(q.id)} top={8} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* gap — free text, either inside a passage or one line per item        */
/* ------------------------------------------------------------------ */

function GapGroup(props: GroupProps) {
  const { group, answers, flags, activeQuestion, onAnswer, onFocusQuestion, onToggleFlag, blockPaste } = props;
  const byNumber = new Map(group.questions.map((q) => [q.number, q]));
  const templated = isTemplated(group);
  const orphans = orphansOf(group);

  return (
    <>
      {templated ? (
        <GapBody
          html={group.bodyHtml!}
          renderGap={(n) => {
            const q = byNumber.get(n);
            if (!q) return null;
            return (
              <span data-question={n} className="inline-flex items-center gap-[8px] align-baseline mx-[4px]">
                <QuestionNumber n={n} active={activeQuestion === n} />
                <TextInput
                  q={q} value={asText(answers[q.id])} width={190} blockPaste={blockPaste}
                  onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(n)}
                />
                {q.rootWord && <span className="font-bold tracking-wide text-[15px] ml-[4px]">{q.rootWord}</span>}
              </span>
            );
          }}
        />
      ) : group.bodyHtml ? <PlainBlock html={group.bodyHtml} /> : null}

      {orphans.length > 0 && (
        <div className={`space-y-[28px] ${templated ? 'mt-[26px]' : ''}`}>
          {orphans.map((q) => {
            const hasInline = /\[\[\d{1,3}\]\]/.test(q.prompt ?? '');
            const parts = (q.prompt ?? '').split(/\[\[\d{1,3}\]\]/);
            return (
              <div key={q.id} data-question={q.number} className="group flex items-start gap-[12px]">
                <QuestionNumber n={q.number} active={activeQuestion === q.number} />
                <div className="flex-1 exam-body !mb-0">
                  {hasInline ? (
                    <span>
                      <Rich text={parts[0]} />
                      <span className="inline-block mx-[6px] align-middle">
                        <TextInput
                          q={q} value={asText(answers[q.id])} width={190} blockPaste={blockPaste}
                          onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(q.number)}
                        />
                      </span>
                      <Rich text={parts.slice(1).join(' ')} />
                    </span>
                  ) : (
                    <>
                      {q.prompt && <Rich text={q.prompt} />}
                      <div className={q.prompt ? 'mt-[12px]' : ''}>
                        <TextInput
                          q={q} value={asText(answers[q.id])} width={280} blockPaste={blockPaste}
                          onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(q.number)}
                        />
                      </div>
                    </>
                  )}
                  {q.rootWord && (
                    <span className="ml-[10px] font-bold tracking-wide text-[15px] align-middle">{q.rootWord}</span>
                  )}
                </div>
                <FlagButton number={q.number} flagged={flags.includes(q.id)} onToggle={() => onToggleFlag(q.id)} top={8} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* cloze — one option list per gap, chosen inside the passage           */
/* ------------------------------------------------------------------ */

function ClozeGroup({ group, answers, activeQuestion, onAnswer, onFocusQuestion }: GroupProps) {
  const byNumber = new Map(group.questions.map((q) => [q.number, q]));

  const gapSelect = (n: number) => {
    const q = byNumber.get(n);
    if (!q) return null;
    // No option list for this gap: let the candidate type the word.
    if ((q.options?.length ?? 0) < 2) {
      return (
        <span data-question={n} className="inline-flex items-center gap-[8px] align-baseline mx-[4px]">
          <QuestionNumber n={n} active={activeQuestion === n} />
          <TextInput
            q={q} value={asText(answers[q.id])} width={190}
            onAnswer={(v) => onAnswer(q.id, v)} onFocus={() => onFocusQuestion(n)}
          />
        </span>
      );
    }
    return (
      <span data-question={n} className="inline-flex items-center gap-[8px] align-baseline mx-[4px]">
        <QuestionNumber n={n} active={activeQuestion === n} />
        <select
          aria-label={`Answer for question ${n}`}
          className="exam-input h-[40px] text-[17px] max-w-[260px]"
          value={asText(answers[q.id])}
          data-answered={!!answers[q.id]}
          onFocus={() => onFocusQuestion(n)}
          onChange={(e) => onAnswer(q.id, e.target.value)}
        >
          <option value="">—</option>
          {(q.options ?? []).map((o) => (
            <option key={o.label} value={o.label}>{o.label}. {o.text}</option>
          ))}
        </select>
      </span>
    );
  };

  const templated = isTemplated(group);
  const orphans = orphansOf(group);

  return (
    <>
      {templated ? <GapBody html={group.bodyHtml!} renderGap={gapSelect} />
        : group.bodyHtml ? <PlainBlock html={group.bodyHtml} /> : null}

      {orphans.length > 0 && (
        <div className={`space-y-[22px] ${templated ? 'mt-[26px]' : ''}`}>
          {orphans.map((q) => (
            <div key={q.id} data-question={q.number} className="flex items-center gap-[12px] flex-wrap">
              {q.prompt && <span className="exam-body !mb-0">{q.prompt}</span>}
              {gapSelect(q.number)}
            </div>
          ))}
        </div>
      )}

      {/* The printed paper lists the options below the text; keep that for reference. */}
      {group.questions.some((q) => (q.options?.length ?? 0) > 0) && (
      <details className="mt-[24px]">
        <summary className="cursor-pointer text-[16px] underline">Show all options</summary>
        <ol className="mt-[12px] space-y-[6px] text-[16px]">
          {group.questions.map((q) => (
            <li key={q.id} className="flex gap-[12px]">
              <span className="font-bold min-w-[34px]">{q.number}</span>
              <span>{(q.options ?? []).map((o) => `${o.label}. ${o.text}`).join('   ')}</span>
            </li>
          ))}
        </ol>
      </details>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* fields — several inputs per item (error identification)              */
/* ------------------------------------------------------------------ */

function FieldsGroup({ group, answers, flags, activeQuestion, onAnswer, onFocusQuestion, onToggleFlag, blockPaste }: GroupProps) {
  const columns = group.fieldColumns ?? ['Line', 'Mistake', 'Correction'];

  return (
    <div className="overflow-x-auto">
      {group.bodyHtml && (
        <div className="exam-body mb-[26px]" dangerouslySetInnerHTML={{ __html: asHtml(group.bodyHtml) }} />
      )}
      <table className="w-full border-collapse exam-body !text-[17px]">
        <thead>
          <tr>
            <th className="border border-[#c9c9c9] px-[10px] py-[8px] text-left w-[80px]">{columns[0]}</th>
            {(group.questions[0]?.fields ?? []).map((f, i) => (
              <th key={f.key} className="border border-[#c9c9c9] px-[10px] py-[8px] text-left">
                {f.label ?? columns[i + 1] ?? f.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.questions.map((q) => {
            const map = asMap(answers[q.id]);
            return (
              <tr key={q.id} data-question={q.number} className="group">
                <td className="border border-[#c9c9c9] px-[10px] py-[8px] align-middle">
                  <span className="inline-flex items-center gap-[6px]">
                    <QuestionNumber n={q.number} active={activeQuestion === q.number} />
                    <FlagButton number={q.number} flagged={flags.includes(q.id)} onToggle={() => onToggleFlag(q.id)} top={0} />
                  </span>
                </td>
                {(q.fields ?? []).map((f: QuestionField) => (
                  <td key={f.key} className="border border-[#c9c9c9] px-[10px] py-[8px]">
                    <input
                      type="text"
                      aria-label={`${f.label ?? f.key} for question ${q.number}`}
                      className="exam-input h-[38px] text-[16px] w-full"
                      data-answered={!!map[f.key]}
                      value={map[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onFocus={() => onFocusQuestion(q.number)}
                      onChange={(e) => onAnswer(q.id, { ...map, [f.key]: e.target.value })}
                      autoComplete="off"
                      spellCheck={false}
                      {...noPaste(blockPaste)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* transform — rewrite the sentence using the given word                */
/* ------------------------------------------------------------------ */

function TransformGroup({ group, answers, flags, activeQuestion, onAnswer, onFocusQuestion, onToggleFlag, blockPaste }: GroupProps) {
  return (
    <div className="space-y-[34px]">
      {group.questions.map((q) => {
        const value = asText(answers[q.id]);
        const words = countWords(value);
        const min = q.minWords ?? 0;
        const max = q.maxWords ?? 0;
        const outOfRange = value !== '' && ((min && words < min) || (max && words > max));
        return (
          <div key={q.id} data-question={q.number} className="group">
            <div className="flex items-start gap-[12px]">
              <QuestionNumber n={q.number} active={activeQuestion === q.number} />
              <div className="flex-1">
                <Rich text={q.prompt} className="exam-body !mb-[10px] block" />
                {q.keyWord && (
                  <p className="mb-[12px] text-[17px]">
                    <span className="font-bold tracking-wide uppercase">{q.keyWord}</span>
                  </p>
                )}
                <div className="flex items-center gap-[10px] flex-wrap exam-body !mb-0">
                  {q.leadIn && <span>{q.leadIn}</span>}
                  <input
                    type="text"
                    aria-label={`Answer for question ${q.number}`}
                    className="exam-input h-[44px] text-[17px] flex-1 min-w-[280px]"
                    data-answered={!!value}
                    value={value}
                    onFocus={() => onFocusQuestion(q.number)}
                    onChange={(e) => onAnswer(q.id, e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    {...noPaste(blockPaste)}
                  />
                  {q.tail && <span>{q.tail}</span>}
                </div>
                {(min || max) > 0 && (
                  <p className={`mt-[8px] text-[15px] ${outOfRange ? 'text-[color:var(--bad)]' : 'text-[#5e5e5e]'}`}>
                    {words} word{words === 1 ? '' : 's'}
                    {min && max ? ` · write between ${min} and ${max} words` : ''}
                  </p>
                )}
              </div>
              <FlagButton number={q.number} flagged={flags.includes(q.id)} onToggle={() => onToggleFlag(q.id)} top={8} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* label / essay                                                       */
/* ------------------------------------------------------------------ */

function LabelGroup(props: GroupProps) {
  const { group } = props;
  return (
    <div>
      {group.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.imageUrl} alt="Diagram to label" className="max-w-full mb-[26px] border border-[#ddd]" />
      )}
      <GapGroup {...props} />
    </div>
  );
}

function EssayGroup({ group, answers, onAnswer, onFocusQuestion, blockPaste }: GroupProps) {
  return (
    <div className="space-y-[26px]">
      {group.questions.map((q) => {
        const text = asText(answers[q.id]);
        const words = countWords(text);
        const min = q.minWords ?? 150;
        return (
          <div key={q.id} data-question={q.number}>
            {group.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.imageUrl} alt="Task prompt" className="max-w-full mb-[22px] border border-[#ddd]" />
            )}
            <textarea
              aria-label={`Response for task ${q.number}`}
              className="exam-input w-full min-h-[420px] leading-[1.7] text-[17px] resize-y"
              value={text}
              onFocus={() => onFocusQuestion(q.number)}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              spellCheck={false}
              {...noPaste(blockPaste)}
            />
            <div className="mt-[10px] flex items-center justify-between text-[16px]">
              <span className={words < min ? 'text-[color:var(--bad)]' : 'text-[color:var(--good)]'}>
                Word count: {words}
              </span>
              <span className="text-[#5e5e5e]">Write at least {min} words.</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
