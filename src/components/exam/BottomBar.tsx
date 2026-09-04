'use client';

import { ExamContent, questionsOfPart } from '@/types/exam';
import { AnswerMap } from '@/lib/grading';
import { CheckIcon } from '../ui/Icons';

interface Props {
  content: ExamContent;
  partIndex: number;
  answers: AnswerMap;
  flags: string[];
  activeQuestion: number | null;
  onGoToPart: (index: number) => void;
  onGoToQuestion: (n: number) => void;
  onReview: () => void;
}

const isAnswered = (v: unknown) =>
  v !== undefined && v !== '' &&
  !(Array.isArray(v) && v.length === 0) &&
  !(v !== null && typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((x) => !x));

export default function BottomBar({
  content, partIndex, answers, flags, activeQuestion, onGoToPart, onGoToQuestion, onReview,
}: Props) {
  const current = content.parts[partIndex];
  const currentQs = questionsOfPart(current);
  const others = content.parts.map((p, i) => ({ p, i })).filter((x) => x.i !== partIndex);

  // A single-skill paper has a handful of parts and they fit as chips; a whole
  // specialised-English paper has nine or more, so it gets a menu instead.
  const compact = content.parts.length > 4;

  return (
    <div className="shrink-0 no-select">
      <div className="flex gap-[6px] px-[20px] pb-[6px]">
        {currentQs.map((q) => (
          <span
            key={q.id}
            className="h-[4px] flex-1 max-w-[46px]"
            style={{ background: isAnswered(answers[q.id]) ? '#5e5e5e' : 'var(--rule)' }}
          />
        ))}
      </div>

      <div className="flex items-stretch border-t border-[#d8d8d8] h-[66px] bg-white">
        <div className="flex items-center gap-[16px] pl-[20px] flex-1 min-w-0">
          <span className="text-[20px] font-bold shrink-0">{current.title}</span>
          <div className="flex items-center gap-[2px] overflow-x-auto min-w-0">
            {currentQs.map((q) => {
              const answered = isAnswered(answers[q.id]);
              const active = activeQuestion === q.number;
              const flagged = flags.includes(q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onGoToQuestion(q.number)}
                  aria-label={`Question ${q.number}${answered ? ', answered' : ', not answered'}${flagged ? ', flagged' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  className={`relative min-w-[30px] h-[34px] px-[4px] text-[18px] tabular-nums focus-ring shrink-0 ${
                    active ? 'border-2 font-bold' : ''
                  } ${answered ? 'font-bold text-black' : 'text-[#4a4a4a]'}`}
                  style={active ? { borderColor: 'var(--brand)' } : undefined}
                >
                  {q.number}
                  {answered && !active && (
                    <span className="absolute left-[4px] right-[4px] bottom-[3px] h-[2px] bg-black" />
                  )}
                  {flagged && (
                    <span
                      className="absolute top-[1px] right-[1px] w-0 h-0"
                      style={{ borderLeft: '6px solid transparent', borderTop: '6px solid var(--bad)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {compact ? (
          <label className="flex items-center gap-[10px] px-[20px] shrink-0 border-l border-[#eee]">
            <span className="text-[16px] text-[#5e5e5e] hidden lg:inline">Go to</span>
            <select
              aria-label="Go to another part"
              value={partIndex}
              onChange={(e) => onGoToPart(Number(e.target.value))}
              className="h-[42px] px-[10px] border border-[#8f8f8f] rounded-[3px] text-[16px] max-w-[280px] bg-white"
            >
              {content.parts.map((p, i) => {
                const qs = questionsOfPart(p);
                const done = qs.filter((q) => isAnswered(answers[q.id])).length;
                const label = p.section ? `${p.section.replace(/^SECTION\s*/i, '').split(':')[0]} · ${p.title}` : p.title;
                return (
                  <option key={p.id} value={i}>{label} — {done}/{qs.length}</option>
                );
              })}
            </select>
          </label>
        ) : (
          <div className="flex items-center gap-[42px] px-[24px] shrink-0">
            {others.map(({ p, i }) => {
              const qs = questionsOfPart(p);
              const done = qs.filter((q) => isAnswered(answers[q.id])).length;
              return (
                <button key={p.id} type="button" onClick={() => onGoToPart(i)} className="flex items-baseline gap-[14px] focus-ring">
                  <span className="text-[20px] font-bold">{p.title}</span>
                  <span className="text-[18px] text-[#3d3d3d] tabular-nums">{done} of {qs.length}</span>
                </button>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onReview}
          aria-label="Review answers and submit"
          title="Review answers and submit"
          className="w-[118px] flex items-center justify-center border-l border-[#d8d8d8] focus-ring shrink-0"
          style={{ background: 'var(--panel)' }}
        >
          <span style={{ color: '#535353' }}><CheckIcon /></span>
        </button>
      </div>
    </div>
  );
}
