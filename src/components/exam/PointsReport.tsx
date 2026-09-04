import Link from 'next/link';

export interface PointsSection {
  /** "SECTION B: LEXICO-GRAMMAR" or "Phần II" — as printed on the paper. */
  label: string;
  awarded: number;
  available: number;
  /** Questions still with a marker, so the section is not final. */
  pending?: number;
}

/**
 * The score report for a paper that is marked in points: a provincial
 * gifted-student paper, a specialised-school entrance paper, a school mock.
 *
 * These papers print a total — 20 is the usual one in Vietnam — and a
 * candidate, their teacher and their parents all read the result as a mark out
 * of that total, section by section. A band would say nothing to any of them,
 * so this is deliberately a mark sheet (phiếu điểm) and not an IELTS form.
 */
export default function PointsReport({
  title, candidate, sections, awarded, available, total, sittingDate, backHref = '/dashboard', pending = 0,
}: {
  title: string;
  candidate: string;
  sections: PointsSection[];
  /** Marks earned, on the paper's own marking scheme. */
  awarded: number;
  /** Marks available on the paper. */
  available: number;
  /** What the paper says it is out of — 20, 100, or the marks themselves. */
  total: number;
  sittingDate?: string | null;
  backHref?: string;
  pending?: number;
}) {
  const scaled = available > 0 ? Math.round((awarded / available) * total * 10) / 10 : 0;
  const percent = available > 0 ? Math.round((awarded / available) * 100) : 0;
  const scaledOut = total !== available;

  return (
    <div className="max-w-[720px] mx-auto px-[24px] py-[40px]">
      <p className="text-[15px] text-[#5e5e5e] mb-[6px]">{candidate}</p>
      <h1 className="text-[30px] font-semibold leading-tight mb-[4px]">{title}</h1>
      {sittingDate && (
        <p className="text-[15px] text-[#5e5e5e]">Completed {new Date(sittingDate).toLocaleDateString()}</p>
      )}

      <hr className="my-[34px] border-0 border-t border-dotted border-[#b9c4d4]" />

      <h2 className="text-[27px] font-semibold leading-tight mb-[6px]" style={{ color: 'var(--brand-dark)' }}>
        Phiếu điểm · Mark sheet
      </h2>
      <p className="text-[16px] text-[#5e5e5e] mb-[24px]">
        This paper is marked in points, the way it is printed — not on the IELTS band scale.
      </p>

      <div className="bg-white border border-[#e6e9ef] rounded-[8px] px-[26px] py-[22px] mb-[18px] text-center">
        <p className="text-[16px] text-[#5e5e5e] mb-[6px]">Tổng điểm · Total</p>
        <p className="text-[46px] font-semibold leading-none tabular-nums" style={{ color: 'var(--brand-dark)' }}>
          {scaled}
          <span className="text-[24px] font-normal text-[#5e5e5e]"> / {total}</span>
        </p>
        <p className="text-[16px] text-[#5e5e5e] mt-[10px]">
          {scaledOut
            ? `${round(awarded)} of ${round(available)} marks · ${percent}%`
            : `${percent}% of the paper`}
        </p>
        {pending > 0 && (
          <p className="text-[15px] mt-[8px]" style={{ color: '#B4801F' }}>
            {pending} question{pending === 1 ? '' : 's'} still with a marker — this may go up.
          </p>
        )}
      </div>

      {sections.length > 1 && (
        <table className="w-full text-[17px] border-collapse mb-[10px]">
          <thead>
            <tr className="text-left border-b border-[#e6e9ef]">
              <th className="py-[10px] font-semibold">Phần · Section</th>
              <th className="py-[10px] font-semibold w-[130px] text-right">Điểm</th>
              <th className="py-[10px] font-semibold w-[90px] text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.label} className="border-b border-[#eef1f5]">
                <td className="py-[11px]">
                  {s.label}
                  {s.pending ? (
                    <span className="text-[15px] text-[#5e5e5e]"> · {s.pending} awaiting a marker</span>
                  ) : null}
                </td>
                <td className="py-[11px] text-right tabular-nums">
                  {round(s.awarded)} / {round(s.available)}
                </td>
                <td className="py-[11px] text-right tabular-nums text-[#5e5e5e]">
                  {s.available > 0 ? Math.round((s.awarded / s.available) * 100) : 0}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[15px] text-[#5e5e5e] mt-[18px]">
        Marks are the paper&rsquo;s own: where a section printed a total and not a mark per question,
        the section&rsquo;s marks were shared evenly across its questions.
      </p>

      <div className="mt-[30px]">
        <Link href={backHref} className="text-[17px] underline">Back</Link>
      </div>
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;
