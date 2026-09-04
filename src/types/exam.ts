/**
 * Exam content model.
 *
 * A whole paper is one JSON document stored on the test row. The importer
 * produces exactly this shape and the authoring UI mutates it in place, so
 * there is a single definition of what a paper is.
 *
 * The type list covers the international exam conventions (IELTS, Cambridge)
 * and the conventions of Vietnamese specialised-English papers — error
 * correction, word formation, open cloze and sentence transformation.
 */

export type ExamModule = 'reading' | 'listening' | 'writing' | 'mixed';

export type QuestionType =
  // --- one answer chosen from a list shown with the question ---------------
  | 'true-false-notgiven'
  | 'yes-no-notgiven'
  | 'multiple-choice'
  | 'multiple-choice-multi'
  // --- one answer chosen from a list shared by the whole task --------------
  | 'matching-headings'
  | 'matching-information'
  | 'matching-features'
  | 'matching-sentence-endings'
  | 'multiple-matching'
  | 'summary-completion-bank'
  | 'gapped-text'
  // --- a word or phrase typed into a gap -----------------------------------
  | 'sentence-completion'
  | 'summary-completion'
  | 'note-completion'
  | 'table-completion'
  | 'flowchart-completion'
  | 'form-completion'
  | 'short-answer'
  | 'open-cloze'
  | 'word-formation'
  // --- an option chosen for each gap inside a passage ----------------------
  | 'multiple-choice-cloze'
  // --- several inputs per item ---------------------------------------------
  | 'error-correction'
  // --- a rewritten sentence -------------------------------------------------
  | 'sentence-transformation'
  // --- other ----------------------------------------------------------------
  | 'diagram-labelling'
  | 'writing-task';

export type QuestionFamily = 'choice' | 'bank' | 'gap' | 'cloze' | 'fields' | 'transform' | 'label' | 'essay';

export const FAMILY_OF: Record<QuestionType, QuestionFamily> = {
  'true-false-notgiven': 'choice',
  'yes-no-notgiven': 'choice',
  'multiple-choice': 'choice',
  'multiple-choice-multi': 'choice',

  'matching-headings': 'bank',
  'matching-information': 'bank',
  'matching-features': 'bank',
  'matching-sentence-endings': 'bank',
  'multiple-matching': 'bank',
  'summary-completion-bank': 'bank',
  'gapped-text': 'bank',

  'sentence-completion': 'gap',
  'summary-completion': 'gap',
  'note-completion': 'gap',
  'table-completion': 'gap',
  'flowchart-completion': 'gap',
  'form-completion': 'gap',
  'short-answer': 'gap',
  'open-cloze': 'gap',
  'word-formation': 'gap',

  'multiple-choice-cloze': 'cloze',
  'error-correction': 'fields',
  'sentence-transformation': 'transform',
  'diagram-labelling': 'label',
  'writing-task': 'essay',
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  'true-false-notgiven': 'True / False / Not Given',
  'yes-no-notgiven': 'Yes / No / Not Given',
  'multiple-choice': 'Multiple choice (one answer)',
  'multiple-choice-multi': 'Multiple choice (several answers)',
  'matching-headings': 'Matching headings',
  'matching-information': 'Matching information',
  'matching-features': 'Matching features',
  'matching-sentence-endings': 'Matching sentence endings',
  'multiple-matching': 'Multiple matching',
  'summary-completion-bank': 'Summary completion (word list)',
  'gapped-text': 'Gapped text (missing sentences)',
  'sentence-completion': 'Sentence completion',
  'summary-completion': 'Summary completion',
  'note-completion': 'Note completion',
  'table-completion': 'Table completion',
  'flowchart-completion': 'Flow-chart completion',
  'form-completion': 'Form completion',
  'short-answer': 'Short answer',
  'open-cloze': 'Open cloze (one word per gap)',
  'word-formation': 'Word formation',
  'multiple-choice-cloze': 'Multiple-choice cloze',
  'error-correction': 'Error identification and correction',
  'sentence-transformation': 'Sentence transformation',
  'diagram-labelling': 'Diagram labelling',
  'writing-task': 'Writing task',
};

/** Grouping used by the type picker in the authoring UI. */
export const TYPE_GROUPS: { label: string; types: QuestionType[] }[] = [
  { label: 'Reading comprehension', types: [
    'multiple-choice', 'multiple-choice-multi', 'true-false-notgiven', 'yes-no-notgiven', 'short-answer'] },
  { label: 'Matching', types: [
    'matching-headings', 'matching-information', 'matching-features', 'matching-sentence-endings',
    'multiple-matching', 'gapped-text'] },
  { label: 'Completion', types: [
    'sentence-completion', 'summary-completion', 'summary-completion-bank', 'note-completion',
    'table-completion', 'flowchart-completion', 'form-completion', 'diagram-labelling'] },
  { label: 'Lexico-grammar', types: [
    'multiple-choice-cloze', 'open-cloze', 'word-formation', 'error-correction', 'sentence-transformation'] },
  { label: 'Writing', types: ['writing-task'] },
];

export const FIXED_OPTIONS: Partial<Record<QuestionType, string[]>> = {
  'true-false-notgiven': ['TRUE', 'FALSE', 'NOT GIVEN'],
  'yes-no-notgiven': ['YES', 'NO', 'NOT GIVEN'],
};

export interface BankOption {
  label: string; // A, B, C … or i, ii, iii …
  text: string;
}

export interface ChoiceOption {
  label: string;
  text: string;
}

/** One input inside a multi-input question, e.g. mistake + correction. */
export interface QuestionField {
  key: string;
  label?: string;
  answers: string[];
  /** Rendered input width in pixels. */
  width?: number;
  placeholder?: string;
}

export interface Question {
  id: string;
  number: number;
  /** Statement or stem. `[[n]]` marks where an inline input belongs. */
  prompt?: string;
  /** choice / cloze families. */
  options?: ChoiceOption[];
  /** Accepted answers. `|` separates alternatives, `(brackets)` are optional. */
  answers: string[];
  /** fields family: one input per entry, all must be right to score. */
  fields?: QuestionField[];
  /** Word formation: the root printed beside the gap. */
  rootWord?: string;
  /** Sentence transformation: the word that must appear, unchanged. */
  keyWord?: string;
  /** Sentence transformation: fixed text before and after the candidate's words. */
  leadIn?: string;
  tail?: string;
  /** How many answers a multi-select question needs. */
  selectCount?: number;
  minWords?: number;
  maxWords?: number;
  points?: number;
  markingNote?: string;
  /**
   * Why the answer is the answer, in a sentence or three.
   *
   * Written by the model when a paper is imported (or afterwards, on demand)
   * and shown to the candidate **after** they have handed in — a review with
   * "Incorrect" and nothing else teaches nobody anything. It is stripped from
   * the copy the candidate sits, along with the answer itself.
   */
  explanation?: string;
}

export interface Group {
  id: string;
  type: QuestionType;
  heading?: string;
  /**
   * How the choices are laid out. Many national papers print A B C D across one
   * line, and copying that makes the screen read like the paper the candidate
   * practised on. `auto` lets the length of the options decide.
   */
  optionLayout?: 'auto' | 'row' | 'stack';
  /** Rubric shown above the task. Simple HTML. */
  instructions?: string;
  /** bank family: the shared option list. */
  bank?: BankOption[];
  /**
   * gap / cloze / bank families: a block of text or HTML containing `[[n]]`
   * markers that are replaced by the input for that question number.
   */
  bodyHtml?: string;
  imageUrl?: string;
  /** Column headings for the fields family. */
  fieldColumns?: string[];
  questions: Question[];
}

export interface Passage {
  title?: string;
  /** Sanitised HTML. `<p data-ref="A">` powers heading-matching tasks. */
  html: string;
}

export interface Part {
  id: string;
  /** "Part 1" */
  title: string;
  /** "Section B: Lexico-Grammar" — printed above the part title when set. */
  section?: string;
  instructions: string;
  passage?: Passage;
  /** A recording for this part. Uploaded by staff after the paper is parsed. */
  audioUrl?: string;
  audioPlayOnce?: boolean;
  /**
   * True when the questions are answered while a recording plays. Set by the
   * parser, and what the automatic split of a mixed paper keys on.
   */
  listening?: boolean;
  /** Points this part contributes, when the paper states them. */
  points?: number;
  groups: Group[];
}

/**
 * How a paper is scored.
 *
 * `band` is the IELTS nine-point scale, and only an IELTS-shaped paper should
 * use it. A provincial gifted-student paper (đề học sinh giỏi) or a specialised
 * -school entrance paper (đề chuyên) is marked in points out of the total
 * printed on it — usually 20, sometimes 10 or 100 — and reporting one of those
 * as "Band 6.5" would be meaningless to the school that set it.
 */
export type ScoringScheme = 'band' | 'points';

export interface ExamContent {
  title: string;
  module: ExamModule;
  variant?: 'academic' | 'general' | 'school';
  /** Left unset on an older paper; `scoringOf` decides from the paper itself. */
  scoring?: ScoringScheme;
  /**
   * The total printed on the paper — 20 for most Vietnamese papers. The marks
   * actually available are the sum of the questions' points; this is what they
   * are scaled onto, so "47 of 60 marks" is reported as "15,7 / 20 điểm".
   */
  totalPoints?: number;
  /**
   * Minutes allowed. **Zero means no limit**: no clock, no automatic hand-in,
   * and the candidate may come back tomorrow and carry on. Papers that do not
   * state a time are imported this way rather than being given an invented one.
   */
  durationMinutes: number;
  transferMinutes?: number;
  /** Shown on the cover and the results page. */
  description?: string;
  /**
   * One recording for the whole paper.
   *
   * Most listening papers are one tape covering every section — IELTS runs
   * Parts 1 to 4 without stopping — so the recording belongs to the paper, not
   * to a part, and it keeps playing as the candidate moves between parts. A
   * paper whose sections each have their own file sets `audioUrl` on the parts
   * instead, and a part's own file always wins over this one.
   */
  audioUrl?: string;
  audioPlayOnce?: boolean;
  /**
   * The marking instructions printed with the paper — usually in the answer
   * key, and usually about the essay: what each criterion is worth, what a full
   * mark looks like, how spelling is treated. Shown to a human marker and sent
   * to the model marker, because a paper's own rubric beats a generic one.
   */
  markingNotes?: string;
  parts: Part[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function allQuestions(content: ExamContent): Question[] {
  return content.parts.flatMap((p) => p.groups.flatMap((g) => g.questions));
}

export function questionsOfPart(part: Part): Question[] {
  return part.groups.flatMap((g) => g.questions);
}

export function totalQuestions(content: ExamContent): number {
  return allQuestions(content).length;
}

export function totalPoints(content: ExamContent): number {
  return allQuestions(content).reduce((sum, q) => sum + (q.points ?? 1), 0);
}

/**
 * Numbers every question from 1. A group's `[[n]]` gap markers are moved with
 * it: leaving them behind would point each gap at a question number that no
 * longer exists, and the input would silently vanish from the passage.
 */
export function renumber(content: ExamContent): ExamContent {
  let n = 1;
  for (const part of content.parts) {
    for (const group of part.groups) {
      const moved: Array<[number, number]> = [];
      for (const q of group.questions) {
        const from = q.number;
        q.number = n++;
        if (from !== q.number) moved.push([from, q.number]);
      }
      if (group.bodyHtml && moved.length) {
        // Two passes through a placeholder, so 2→3 cannot then be caught by 3→4.
        let html = group.bodyHtml;
        for (const [from] of moved) html = html.split(`[[${from}]]`).join(`{{${from}}}`);
        for (const [from, to] of moved) html = html.split(`{{${from}}}`).join(`[[${to}]]`);
        group.bodyHtml = html;
      }
    }
  }
  return content;
}

export function groupRangeLabel(group: Group): string {
  const nums = group.questions.map((q) => q.number);
  if (!nums.length) return 'Questions';
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `Question ${lo}` : `Questions ${lo}–${hi}`;
}

/** True when the group's inputs live inside `bodyHtml` rather than per row. */
export function isTemplated(group: Group): boolean {
  return !!group.bodyHtml && /\[\[\d{1,3}\]\]/.test(group.bodyHtml);
}

export function emptyContent(module: ExamModule = 'reading'): ExamContent {
  return {
    title: 'Untitled paper',
    module,
    variant: 'academic',
    durationMinutes: module === 'listening' ? 30 : 60,
    transferMinutes: 0,
    parts: [],
  };
}

/** Whether a part is answered against a recording. */
export function isListeningPart(part: Part): boolean {
  if (part.listening) return true;
  const text = `${part.section ?? ''} ${part.title} ${part.instructions}`.toLowerCase();
  return /\blisten(ing)?\b|\brecording\b|\bbài nghe\b|\bphần nghe\b|\bnghe\b/.test(text);
}

/** The parts answered against a recording, in the order they are sat. */
export function listeningParts(content: ExamContent): Part[] {
  return content.parts.filter(isListeningPart);
}

export interface PartAudio {
  src: string;
  /**
   * `part` — this section has its own file, and it restarts when the section
   * does. `paper` — one tape for the whole paper: it starts once and runs on
   * across every part, exactly as an examination tape does.
   */
  scope: 'part' | 'paper';
  playOnce: boolean;
}

/**
 * The recording a part is answered against. A part's own file wins; failing
 * that, a paper-wide recording covers every listening part of the paper.
 */
export function audioFor(content: ExamContent, part: Part | undefined): PartAudio | null {
  if (part?.audioUrl) {
    return { src: part.audioUrl, scope: 'part', playOnce: part.audioPlayOnce !== false };
  }
  if (!content.audioUrl) return null;
  // A paper-wide tape covers the listening parts. On a paper that is all
  // listening every part qualifies, which is the common case.
  if (!part || isListeningPart(part) || content.module === 'listening') {
    return { src: content.audioUrl, scope: 'paper', playOnce: content.audioPlayOnce !== false };
  }
  return null;
}

/** True when every listening part of a paper has something to play. */
export function missingAudio(content: ExamContent): Part[] {
  if (content.audioUrl) return [];
  return listeningParts(content).filter((part) => !part.audioUrl);
}

/** True when a paper mixes a listening section with written ones. */
export function hasListeningSplit(content: ExamContent): boolean {
  const listening = content.parts.filter(isListeningPart).length;
  return listening > 0 && listening < content.parts.length;
}

/**
 * The paper as a candidate may see it, with everything that could give the
 * answers away taken out.
 *
 * This matters more than it looks. The exam screen is a client component, so
 * whatever the server hands it travels to the browser and can be read out of
 * the page source — the accepted answers, the marker's notes, the rubric. None
 * of that is needed to render a question, and marking happens on the server
 * from the paper in the database, so the copy the candidate gets is stripped.
 */
export function forCandidate(content: ExamContent): ExamContent {
  // The keys are dropped rather than blanked: a payload that still carries
  // "markingNote" for every question, even empty, invites the reader to look.
  const { markingNotes, ...paper } = content;
  return {
    ...paper,
    parts: content.parts.map((part) => ({
      ...part,
      groups: part.groups.map((group) => ({
        ...group,
        questions: group.questions.map((question) => {
          const { answers, markingNote, explanation, fields, ...q } = question;
          return {
            ...q,
            // Every renderer expects the array to exist; none of them read it.
            answers: [] as string[],
            ...(fields ? { fields: fields.map(({ answers: _drop, ...f }) => ({ ...f, answers: [] as string[] })) } : {}),
          };
        }),
      })),
    })),
  };
}

/** Zero minutes is the platform's way of saying "no time limit". */
export const isUntimed = (minutes: number | null | undefined): boolean => !minutes || minutes <= 0;

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/**
 * Which scale this paper is reported on. What the paper says wins; otherwise
 * only a paper that looks like IELTS gets a band, because every other paper in
 * this platform's world is marked in points.
 */
export function scoringOf(content: Pick<ExamContent, 'scoring' | 'variant' | 'module' | 'title' | 'description'>): ScoringScheme {
  if (content.scoring) return content.scoring;
  if (content.variant === 'school') return 'points';
  const text = `${content.title ?? ''} ${content.description ?? ''}`.toLowerCase();
  if (/\bielts\b/.test(text)) return 'band';
  // A single-skill Academic or General Training paper is the IELTS shape.
  const ieltsShaped = (content.variant === 'academic' || content.variant === 'general')
    && (content.module === 'listening' || content.module === 'reading' || content.module === 'writing');
  return ieltsShaped ? 'band' : 'points';
}

/** Marks actually available on the paper: the sum of its questions. */
export function marksAvailable(content: ExamContent): number {
  return totalPoints(content);
}

/** The total the paper is reported out of — its printed total, or its marks. */
export function reportedTotal(content: ExamContent): number {
  const stated = content.totalPoints ?? 0;
  return stated > 0 ? stated : marksAvailable(content);
}

/** Puts a mark onto the paper's printed total, to one decimal place. */
export function scaleToTotal(content: ExamContent, awarded: number): number {
  const available = marksAvailable(content);
  const total = reportedTotal(content);
  if (!available || available === total) return Math.round(awarded * 10) / 10;
  return Math.round((awarded / available) * total * 10) / 10;
}
