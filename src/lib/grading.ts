import { ExamContent, FAMILY_OF, Question, allQuestions } from '@/types/exam';

/** A candidate answer: a string, a set (multi-select), or one value per field. */
export type AnswerValue = string | string[] | Record<string, string>;
export type AnswerMap = Record<string, AnswerValue>;

export interface QuestionResult {
  questionId: string;
  number: number;
  correct: boolean;
  awarded: number;
  possible: number;
  given: AnswerValue | null;
  expected: string[];
  /** True when a human has to award the marks (essay tasks). */
  manual: boolean;
}

export interface GradeResult {
  raw: number;
  possible: number;
  /** Points reserved for tasks a person must mark. */
  manualPossible: number;
  perQuestion: QuestionResult[];
  requiresManualMarking: boolean;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};

/**
 * Candidate answers are marked leniently in the ways a human marker would be:
 * case, surrounding punctuation, doubled spaces and a leading article are
 * ignored. Everything else must match one of the accepted answers.
 */
export function normalise(value: string): string {
  let v = String(value).toLowerCase().trim();
  v = v.replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"');
  v = v.replace(/[‐-―]/g, '-');
  v = v.replace(/^[\s"'(\[]+|[\s"')\].,;:!?]+$/g, '');
  v = v.replace(/\s+/g, ' ');
  v = v.replace(/^(a|an|the)\s+/, '');
  if (NUMBER_WORDS[v]) v = NUMBER_WORDS[v];
  return v;
}

/**
 * Expands an accepted-answer list:
 *   "colour|color"    → two answers
 *   "(the) railway"   → with and without the bracketed words
 *   "give up/quit"    → either single token
 */
export function expand(answers: string[]): string[] {
  const out: string[] = [];
  for (const a of answers ?? []) {
    for (const piece of String(a).split(/\s*\|\s*/)) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      out.push(trimmed);
      if (/^[^\s]+\/[^\s]+$/.test(trimmed)) out.push(...trimmed.split('/'));
      const withoutBrackets = trimmed.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (withoutBrackets && withoutBrackets !== trimmed) out.push(withoutBrackets);
      const unwrapped = trimmed.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
      if (unwrapped && unwrapped !== trimmed) out.push(unwrapped);
    }
  }
  return Array.from(new Set(out));
}

function accepts(answers: string[], given: string): boolean {
  const list = expand(answers).map(normalise).filter(Boolean);
  return list.length > 0 && list.includes(normalise(given));
}

function countWords(text: string): number {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t ? t.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

export function isCorrect(question: Question, given: AnswerValue | null | undefined): boolean {
  if (given === null || given === undefined || given === '') return false;

  // Several inputs on one item (error correction): every field must be right.
  if (question.fields?.length) {
    const map = (typeof given === 'object' && !Array.isArray(given)) ? given : {};
    return question.fields.every((f) => {
      const value = map[f.key];
      return typeof value === 'string' && value.trim() !== '' && accepts(f.answers, value);
    });
  }

  // Multi-select: the whole set must match.
  if (Array.isArray(given)) {
    const accepted = expand(question.answers).map(normalise).filter(Boolean).sort();
    const got = given.map(normalise).filter(Boolean).sort();
    return got.length === accepted.length && got.every((g, i) => g === accepted[i]);
  }

  if (typeof given !== 'string') return false;

  // Sentence transformation: the key word must appear unchanged, the length
  // must be within the stated range, and the wording must match a model answer.
  if (question.keyWord) {
    const words = countWords(given);
    if (question.minWords && words < question.minWords) return false;
    if (question.maxWords && words > question.maxWords) return false;
    const key = question.keyWord.toLowerCase().trim();
    if (key && !normalise(given).split(/\s+/).includes(normalise(key))) return false;
  }

  return accepts(question.answers, given);
}

export function grade(content: ExamContent, answers: AnswerMap): GradeResult {
  const perQuestion: QuestionResult[] = [];
  let raw = 0;
  let possible = 0;
  let manualPossible = 0;
  let manualNeeded = false;

  for (const part of content.parts) {
    for (const group of part.groups) {
      const manual = FAMILY_OF[group.type] === 'essay';
      for (const q of group.questions) {
        const points = q.points ?? 1;
        possible += points;

        if (manual) {
          manualNeeded = true;
          manualPossible += points;
          perQuestion.push({
            questionId: q.id, number: q.number, correct: false, awarded: 0,
            possible: points, given: answers[q.id] ?? null, expected: q.answers, manual: true,
          });
          continue;
        }

        const ok = isCorrect(q, answers[q.id]);
        if (ok) raw += points;
        perQuestion.push({
          questionId: q.id, number: q.number, correct: ok, awarded: ok ? points : 0,
          possible: points, given: answers[q.id] ?? null,
          expected: q.fields?.length ? q.fields.flatMap((f) => f.answers) : q.answers,
          manual: false,
        });
      }
    }
  }

  void allQuestions;
  return { raw, possible, manualPossible, perQuestion, requiresManualMarking: manualNeeded };
}
