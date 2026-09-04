import Link from 'next/link';
import { SkillName } from '@/lib/db';
import { SKILL_LABEL, describeBand } from '@/lib/band-descriptors';

export interface ReportSkill {
  skill: SkillName;
  band: number | null;
  attemptId: string | null;
  note?: string;
}

function SkillIcon({ skill }: { skill: SkillName }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (skill === 'listening') {
    return <svg {...common}><path d="M5 10a7 7 0 0 1 14 0c0 4-2.6 5-2.6 8.2A2.8 2.8 0 0 1 13.6 21c-1.4 0-2.3-.9-2.3-2.3 0-2.6 3.1-2.4 3.1-6a4.4 4.4 0 0 0-8.8 0" /></svg>;
  }
  if (skill === 'reading') {
    return <svg {...common}><path d="M4 5.2h6.2a2.6 2.6 0 0 1 2.6 2.6V20a2 2 0 0 0-2-2H4V5.2Z" /><path d="M20 5.2h-4.2a2.6 2.6 0 0 0-2.6 2.6V20a2 2 0 0 1 2-2H20V5.2Z" /></svg>;
  }
  if (skill === 'writing') {
    return <svg {...common}><path d="M12 3.5v13" /><path d="M8.6 6.9 12 3.5l3.4 3.4" /><path d="M8.4 20.5h7.2" /></svg>;
  }
  return <svg {...common}><path d="M4 5.5h16v10.2H9.8L5.6 19v-3.3H4V5.5Z" /><circle cx="7.4" cy="7.8" r=".9" fill="currentColor" stroke="none" /></svg>;
}

/**
 * The candidate's score report. One row per skill with the band, the overall
 * band, then a plain-language explanation of what each band means.
 */
export default function ScoreReport({
  title, candidate, skills, overall, sittingDate, backHref = '/dashboard', showExplanations = true,
}: {
  title: string;
  candidate: string;
  skills: ReportSkill[];
  overall: number | null;
  sittingDate?: string | null;
  backHref?: string;
  showExplanations?: boolean;
}) {
  return (
    <div className="max-w-[720px] mx-auto px-[24px] py-[40px]">
      <p className="text-[15px] text-[#5e5e5e] mb-[6px]">{candidate}</p>
      <h1 className="text-[30px] font-semibold leading-tight mb-[4px]">{title}</h1>
      {sittingDate && (
        <p className="text-[15px] text-[#5e5e5e]">Completed {new Date(sittingDate).toLocaleDateString()}</p>
      )}

      <hr className="my-[34px] border-0 border-t border-dotted border-[#b9c4d4]" />

      <h2 className="text-[27px] font-semibold leading-tight mb-[24px]" style={{ color: 'var(--brand-dark)' }}>
        Your full score and explanation
      </h2>

      <div className="space-y-[12px]">
        {skills.map((s) => (
          <div key={s.skill} className="flex items-center gap-[18px] bg-white border border-[#e6e9ef] rounded-[8px] px-[22px] py-[18px]">
            <span style={{ color: 'var(--brand)' }}><SkillIcon skill={s.skill} /></span>
            <span className="flex-1 text-[19px]">{SKILL_LABEL[s.skill]}</span>
            <span className="text-[21px] tabular-nums">
              {s.band === null ? <span className="text-[16px] text-[#5e5e5e]">Pending</span> : s.band.toFixed(1)}
            </span>
          </div>
        ))}

        <div className="flex items-center gap-[18px] bg-white border border-[#e6e9ef] rounded-[8px] px-[22px] py-[20px]">
          <span className="flex-1 text-[20px] font-bold">Your overall band score</span>
          <span className="text-[22px] font-bold tabular-nums">
            {overall === null ? <span className="text-[16px] font-normal text-[#5e5e5e]">Pending</span> : overall.toFixed(1)}
          </span>
        </div>
      </div>

      {showExplanations && (
        <>
          <hr className="my-[34px] border-0 border-t border-dotted border-[#b9c4d4]" />
          <h2 className="text-[21px] font-bold mb-[18px]">Your scores explained:</h2>
          <div className="space-y-[18px]">
            {skills.map((s) => (
              <div key={s.skill}>
                <div className="flex items-center gap-[18px] bg-white border border-[#e6e9ef] rounded-[8px] px-[22px] py-[16px] mb-[10px]">
                  <span style={{ color: 'var(--brand)' }}><SkillIcon skill={s.skill} /></span>
                  <span className="flex-1 text-[19px]">{SKILL_LABEL[s.skill]}</span>
                  <span className="text-[20px] tabular-nums">{s.band === null ? '—' : s.band.toFixed(1)}</span>
                </div>
                <p className="text-[16px] leading-[1.6] text-[#3d3d3d] px-[4px]">{describeBand(s.skill, s.band)}</p>
                {s.note && <p className="text-[15px] leading-[1.6] text-[#5e5e5e] px-[4px] mt-[6px] italic">{s.note}</p>}
                {s.attemptId && (
                  <Link href={`/results/${s.attemptId}`} className="inline-block text-[15px] underline mt-[8px] px-[4px]">
                    See every answer for {SKILL_LABEL[s.skill].toLowerCase()}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <hr className="my-[34px] border-0 border-t border-dotted border-[#b9c4d4]" />
      <Link href={backHref} className="text-[16px] underline">Back to your tests</Link>
    </div>
  );
}
