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
}

export interface Group {
  id: string;
  type: QuestionType;
  heading?: string;
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
  audioUrl?: string;
  audioPlayOnce?: boolean;
  /** Points this part contributes, when the paper states them. */
  points?: number;
  groups: Group[];
}

export interface ExamContent {
  title: string;
  module: ExamModule;
  variant?: 'academic' | 'general' | 'school';
  durationMinutes: number;
  transferMinutes?: number;
  /** Shown on the cover and the results page. */
  description?: string;
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

export function renumber(content: ExamContent): ExamContent {
  let n = 1;
  for (const part of content.parts)
    for (const group of part.groups)
      for (const q of group.questions) q.number = n++;
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
