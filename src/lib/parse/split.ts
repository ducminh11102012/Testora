import { ExamContent, FAMILY_OF, Part, isListeningPart } from '@/types/exam';
import { SkillName } from '@/lib/db';
import { uid } from '../utils';

/**
 * A paper does not always want to be one paper.
 *
 * A candidate cannot sit a listening section and a written section in the same
 * sitting: the recording runs once, and the written half has to wait until it
 * has finished. So an upload that contains both is split — listening first, the
 * rest after — and the two halves are grouped as one full test, which is also
 * exactly the shape an IELTS paper wants.
 */

export type PaperSkill = Extract<SkillName, 'listening' | 'reading' | 'writing'>;

/** The order a full test is sat in. */
const ORDER: PaperSkill[] = ['listening', 'reading', 'writing'];

const LABEL: Record<PaperSkill, string> = {
  listening: 'Listening',
  reading: 'Reading and language',
  writing: 'Writing',
};

/** Which paper a part belongs in. */
export function skillOfPart(part: Part): PaperSkill {
  if (isListeningPart(part)) return 'listening';

  const groups = part.groups.length;
  const essays = part.groups.filter((g) => FAMILY_OF[g.type] === 'essay').length;
  if (groups > 0 && essays === groups) return 'writing';

  // A section the paper calls Writing is a writing section even when the parser
  // typed one of its tasks as something else — which happens whenever a task is
  // printed as a numbered question rather than a blank page.
  const text = `${part.section ?? ''} ${part.title} ${part.instructions}`.toLowerCase();
  const saysWriting = /\bwriting\b|\bbài viết\b|\bphần viết\b|\bwrite an? (essay|letter|report|article)\b/.test(text);
  if (saysWriting && (essays > 0 || groups === 0)) return 'writing';

  return 'reading';
}

/** True when the upload is an IELTS paper, which is always sat as a full test. */
export function looksLikeIelts(content: ExamContent): boolean {
  const haystack = [
    content.title,
    ...content.parts.map((p) => `${p.section ?? ''} ${p.title} ${p.instructions}`),
  ].join(' ').toLowerCase();
  if (/\bielts\b/.test(haystack)) return true;
  // The unmistakable shape: three or four numbered sections, a reading passage
  // and the two writing tasks.
  const hasTaskOne = /\btask 1\b/.test(haystack) && /\btask 2\b/.test(haystack);
  const hasBands = /\bband score\b|\bacademic reading\b|\bgeneral training\b/.test(haystack);
  return hasTaskOne && hasBands;
}

export interface SplitPaper {
  skill: PaperSkill;
  title: string;
  content: ExamContent;
}

export interface SplitResult {
  papers: SplitPaper[];
  /** True when the upload really was more than one paper. */
  split: boolean;
  ielts: boolean;
  warnings: string[];
}

/**
 * Splits an upload into the papers it should become. A single-skill upload comes
 * back unchanged, so the caller can treat both cases the same way.
 */
export function splitPaper(
  content: ExamContent,
  opts: { whole?: boolean } = {},
): SplitResult {
  const warnings: string[] = [];
  const ielts = looksLikeIelts(content);

  /*
   * "Keep this as one paper." A centre's own paper often has a listening
   * section, a reading section and a writing task, and is sat in one sitting
   * as one paper; splitting it into three is right for a full IELTS test and
   * wrong for that. The operator says which, and this is them saying it.
   */
  if (opts.whole) {
    const skill = skillOfPart(content.parts[0] ?? { id: '', title: '', groups: [] });
    return { papers: [{ skill, title: content.title, content }], split: false, ielts, warnings };
  }

  const buckets = new Map<PaperSkill, Part[]>();
  for (const part of content.parts) {
    const skill = skillOfPart(part);
    const list = buckets.get(skill) ?? [];
    list.push({ ...part, listening: skill === 'listening' ? true : part.listening });
    buckets.set(skill, list);
  }

  const present = ORDER.filter((skill) => (buckets.get(skill)?.length ?? 0) > 0);
  const hasListening = present.includes('listening');

  // One skill, or several skills with no listening in an ordinary paper: leave
  // it alone. Splitting a mixed lexico-grammar paper into pieces would only
  // annoy the centre that wrote it.
  if (present.length < 2 || (!hasListening && !ielts)) {
    return { papers: [{ skill: present[0] ?? 'reading', title: content.title, content }], split: false, ielts, warnings };
  }

  const papers: SplitPaper[] = present.map((skill) => {
    const parts = buckets.get(skill)!;
    const stated = parts.reduce((sum, p) => sum + (p.points ?? 0), 0);
    return {
      skill,
      title: `${content.title} — ${LABEL[skill]}`,
      content: {
        ...content,
        // The recording belongs to the listening paper. Leaving it on the
        // written half would put a play button above a reading passage.
        audioUrl: skill === 'listening' ? content.audioUrl : undefined,
        // Each half keeps its own id space, so editing one cannot disturb the
        // other. Part titles are renumbered within the half, because three
        // sections all called "Part 1" would be unnavigable once they are
        // sitting in the same paper.
        parts: renumberParts(parts).map((p) => ({ ...p, id: p.id || uid('part') })),
        title: `${content.title} — ${LABEL[skill]}`,
        module: skill,
        // The parent paper's time was for the whole thing; a half has none until
        // the centre sets one, which the platform treats as "no limit".
        durationMinutes: 0,
        description: stated ? `${stated} point(s) on the printed paper.` : content.description,
      },
    };
  });

  warnings.push(
    hasListening
      ? `The upload contains a listening section, so it was split into ${papers.length} papers — `
        + `${papers.map((p) => LABEL[p.skill]).join(', ')} — and grouped as one full test. `
        + 'The listening paper needs its recording uploaded before it can be published.'
      : `This looks like an IELTS paper, so it was split by skill into ${papers.length} papers and grouped as one full test.`,
  );

  return { papers, split: true, ielts, warnings };
}

/**
 * Papers number their parts within a section, so pulling sections apart can
 * leave a paper with several "Part 1"s. Where the titles collide they are
 * numbered again from one, and the printed title is kept in the section line so
 * nothing is lost.
 */
function renumberParts(parts: Part[]): Part[] {
  const titles = parts.map((p) => p.title.trim().toLowerCase());
  if (new Set(titles).size === titles.length) return parts;
  return parts.map((part, i) => ({
    ...part,
    title: `Part ${i + 1}`,
    section: part.section ?? (part.title.trim() && part.title.trim().toLowerCase() !== `part ${i + 1}` ? part.title : undefined),
  }));
}
