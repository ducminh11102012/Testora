'use client';

import { ExamContent, questionsOfPart } from '@/types/exam';
import { AnswerMap } from '@/lib/grading';
import { CloseIcon, SendIcon } from '../ui/Icons';

export default function ReviewScreen({
  content, answers, flags, onClose, onJump, onSubmit, submitting,
}: {
  content: ExamContent;
  answers: AnswerMap;
  flags: string[];
  onClose: () => void;
  onJump: (partIndex: number, n: number) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const all = content.parts.flatMap((p, i) => questionsOfPart(p).map((q) => ({ q, partIndex: i })));
  const unanswered = all.filter(({ q }) => {
    const v = answers[q.id];
    if (v === undefined || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (v && typeof v === 'object') return Object.values(v).every((x) => !x);
    return false;
  });

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Submission page">
      <div className="px-[8px] pt-[3px]">
        <div className="h-[9px] w-full rounded-full" style={{ background: 'var(--rail-track)' }} />
      </div>

      <div className="relative max-w-[1099px] mx-auto px-[24px] pb-[80px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Return to the test"
          className="fixed right-[52px] top-[42px] focus-ring"
        >
          <CloseIcon />
        </button>

        <h1 className="text-[38px] font-semibold text-center pt-[34px] pb-[12px]">Submission page</h1>
        <p className="text-center text-[19px] text-[#3d3d3d] mb-[36px]">
          Check your answers before you submit. You cannot change them afterwards.
        </p>

        <div className="grid gap-[8px] mb-[34px] sm:grid-cols-3">
          <Stat label="Questions" value={String(all.length)} />
          <Stat label="Answered" value={String(all.length - unanswered.length)} />
          <Stat label="Flagged for review" value={String(flags.length)} />
        </div>

        {content.parts.map((part, pi) => (
          <section key={part.id} className="mb-[30px]">
            {part.section && (part.section !== content.parts[pi - 1]?.section) && (
              <p className="text-[14px] font-semibold uppercase tracking-[0.1em] mb-[8px]" style={{ color: 'var(--brand)' }}>
                {part.section}
              </p>
            )}
            <h2 className="text-[22px] font-bold mb-[12px]">{part.title}</h2>
            <div className="flex flex-wrap gap-[8px]">
              {questionsOfPart(part).map((q) => {
                const v = answers[q.id];
                const answered = !unanswered.some((u) => u.q.id === q.id) && v !== undefined;
                const flagged = flags.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onJump(pi, q.number)}
                    className={`relative w-[54px] h-[46px] border text-[18px] focus-ring ${
                      answered ? 'border-[#8f8f8f] bg-[#f4f4f4] font-semibold' : 'border-[#c4142e] text-[#c4142e]'
                    }`}
                    title={answered ? `Question ${q.number}: answered` : `Question ${q.number}: not answered`}
                  >
                    {q.number}
                    {flagged && (
                      <span
                        className="absolute top-0 right-0 w-0 h-0"
                        style={{ borderLeft: '9px solid transparent', borderTop: '9px solid var(--brand)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {unanswered.length > 0 && (
          <div
            className="border rounded-[3px] px-[22px] py-[16px] text-[18px] mb-[28px]"
            style={{ background: '#FFFCF0', borderColor: '#EFE3B0' }}
          >
            You have not answered {unanswered.length} question{unanswered.length === 1 ? '' : 's'}:{' '}
            {unanswered.slice(0, 25).map(({ q }) => q.number).join(', ')}
            {unanswered.length > 25 ? '…' : ''}
          </div>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="w-full flex items-center gap-[26px] px-[26px] h-[112px] text-white text-[26px] rounded-[3px] disabled:opacity-60 focus-ring"
          style={{ background: 'var(--brand)' }}
        >
          <SendIcon size={30} />
          <span className="flex-1 text-left">{submitting ? 'Submitting…' : 'Submit my answers'}</span>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#e3e3e3] rounded-[3px] px-[20px] py-[16px]">
      <div className="text-[32px] font-semibold leading-none mb-[6px]">{value}</div>
      <div className="text-[16px] text-[#5e5e5e]">{label}</div>
    </div>
  );
}
