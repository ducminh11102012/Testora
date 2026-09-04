'use client';

export default function QuestionNumber({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      className={
        active
          ? 'inline-flex items-center justify-center min-w-[34px] h-[34px] px-[6px] border-2 border-black font-bold text-[19px] shrink-0'
          : 'inline-flex items-center justify-center min-w-[34px] h-[34px] px-[6px] font-bold text-[19px] shrink-0'
      }
    >
      {n}
    </span>
  );
}
