/**
 * Everything that can be wrong with a paper, found before a candidate finds it.
 *
 * A paper that reaches a candidate broken is expensive in a way an ordinary bug
 * is not: the sitting is happening, the room is full, and there is no second
 * chance at it. Almost all of the breakage is a handful of shapes, and every
 * one of them is visible in the paper itself — a gap with no question behind
 * it, a question with nothing to mark it against, a listening paper with no
 * recording, two questions claiming the same number.
 *
 * So the paper is checked, and the checks are split in two: `blocking` is what
 * makes the paper unsittable and what publishing refuses over, `advisory` is
 * what a teacher should look at but may reasonably disagree with.
 */

import {
  ExamContent, FAMILY_OF, Group, Part, Question, marksAvailable, missingAudio, reportedTotal,
  scoringOf, totalQuestions,
} from '@/types/exam';

export type PreflightCode =
  | 'empty'
  | 'duplicate-numbers'
  | 'no-answer'
  | 'thin-options'
  | 'orphan-gap'
  | 'missing-gap'
  | 'no-recording'
  | 'unknown-answer-label'
  | 'marks-mismatch'
  | 'no-word-limit'
  | 'empty-part'
  | 'long-paper'
  | 'no-duration';

export interface Problem {
  code: PreflightCode;
  /** What is wrong, in the words a teacher would use. */
  message: string;
  /** Where to look: part title, and the question numbers involved. */
  where?: string;
  numbers?: number[];
}

export interface PreflightResult {
  /** Publishing is refused while any of these stand. */
  blocking: Problem[];
  /** Worth a look before the paper is sat, but not a refusal. */
  advisory: Problem[];
  /** A one-line summary for the console. */
  summary: string;
}

const GAP_MARKER = /\[\[(\d{1,3})\]\]/g;

/** The numbers a gap-filling block refers to. */
function markersIn(html: string | undefined): number[] {
  if (!html) return [];
  const found: number[] = [];
  for (const match of html.matchAll(GAP_MARKER)) found.push(Number(match[1]));
  return found;
}

/** True when this question type is answered by choosing from a printed list. */
function choosesFromList(group: Group): boolean {
  const family = FAMILY_OF[group.type];
  return family === 'choice' || family === 'bank' || family === 'cloze';
}

/** The labels a candidate could legitimately choose for this question. */
function labelsFor(group: Group, question: Question): string[] {
  if (question.options?.length) return question.options.map((o) => o.label.toUpperCase());
  if (group.bank?.length) return group.bank.map((b) => b.label.toUpperCase());
  return [];
}

/** Does this question need something to mark it against? */
function needsAnswer(group: Group, question: Question): boolean {
  const family = FAMILY_OF[group.type];
  if (family === 'essay') return false;
  if (question.points === 0) return false;
  if (family === 'fields') return (question.fields ?? []).some((f) => !f.answers.length);
  return !question.answers.length;
}

export function preflight(content: ExamContent): PreflightResult {
  const blocking: Problem[] = [];
  const advisory: Problem[] = [];

  const parts: Part[] = content.parts ?? [];
  const questions = parts.flatMap((part) => part.groups.flatMap((group) => group.questions.map((q) => ({ part, group, q }))));

  /* ------------------------------- the basics ---------------------------- */

  if (!parts.length || totalQuestions(content) === 0) {
    blocking.push({
      code: 'empty',
      message: 'This paper has no questions in it, so there is nothing for a candidate to do.',
    });
    return { blocking, advisory, summary: 'Empty paper' };
  }

  for (const part of parts) {
    if (part.groups.every((g) => g.questions.length === 0)) {
      advisory.push({
        code: 'empty-part',
        message: `“${part.title}” has no questions. A part a candidate can open and not answer usually means the parse lost something.`,
        where: part.title,
      });
    }
  }

  /* ------------------------------ numbering ------------------------------ */

  const seen = new Map<number, number>();
  for (const { q } of questions) seen.set(q.number, (seen.get(q.number) ?? 0) + 1);
  const repeated = [...seen.entries()].filter(([, n]) => n > 1).map(([number]) => number);
  if (repeated.length) {
    blocking.push({
      code: 'duplicate-numbers',
      message: `Question ${repeated.slice(0, 8).join(', ')}${repeated.length > 8 ? '…' : ''} appears more than once. `
        + 'The exam screen keys its navigator on the number, so two questions with one number cannot both be reached.',
      numbers: repeated,
    });
  }

  /* ------------------------------- answers ------------------------------- */

  const unanswered = questions.filter(({ group, q }) => needsAnswer(group, q)).map(({ q }) => q.number);
  if (unanswered.length) {
    blocking.push({
      code: 'no-answer',
      message: `${unanswered.length} question(s) have nothing to mark against: `
        + `${unanswered.slice(0, 12).join(', ')}${unanswered.length > 12 ? '…' : ''}. `
        + 'Type the answers in, upload the answer key, or let the model write them.',
      numbers: unanswered,
    });
  }

  const strayLabels: number[] = [];
  for (const { group, q } of questions) {
    if (!choosesFromList(group)) continue;
    const labels = labelsFor(group, q);
    if (!labels.length) continue;
    // An answer key that names an option the paper does not print marks every
    // candidate wrong, whatever they choose.
    for (const answer of q.answers) {
      const wanted = answer.split('|')[0].trim().toUpperCase();
      if (wanted && wanted.length <= 4 && !labels.includes(wanted)) strayLabels.push(q.number);
    }
  }
  if (strayLabels.length) {
    blocking.push({
      code: 'unknown-answer-label',
      message: `The answer for question ${[...new Set(strayLabels)].slice(0, 8).join(', ')} names an option that is not printed on the paper, `
        + 'so every candidate would be marked wrong.',
      numbers: [...new Set(strayLabels)],
    });
  }

  /* -------------------------------- options ------------------------------ */

  const thin = questions
    .filter(({ group, q }) => choosesFromList(group) && !group.bank?.length && (q.options?.length ?? 0) < 2)
    .map(({ q }) => q.number);
  if (thin.length) {
    blocking.push({
      code: 'thin-options',
      message: `Question ${thin.slice(0, 8).join(', ')}${thin.length > 8 ? '…' : ''} is a choice with fewer than two options to choose from.`,
      numbers: thin,
    });
  }

  /* --------------------------------- gaps -------------------------------- */

  for (const part of parts) {
    for (const group of part.groups) {
      const markers = markersIn(group.bodyHtml);
      if (!markers.length) continue;
      const own = new Set(group.questions.map((q) => q.number));
      const orphans = markers.filter((n) => !own.has(n));
      if (orphans.length) {
        blocking.push({
          code: 'orphan-gap',
          message: `“${group.heading ?? part.title}” has a gap numbered ${[...new Set(orphans)].join(', ')} with no question behind it: `
            + 'the candidate sees a box that cannot be answered.',
          where: part.title,
          numbers: [...new Set(orphans)],
        });
      }
      const missing = group.questions
        .filter((q) => !markers.includes(q.number) && !/\[\[\d{1,3}\]\]/.test(q.prompt ?? ''))
        .map((q) => q.number);
      if (missing.length) {
        advisory.push({
          code: 'missing-gap',
          message: `Question ${missing.slice(0, 8).join(', ')} belongs to a gap-filling task but has no gap in the text. `
            + 'Check the passage: the marker was probably lost in the parse.',
          where: part.title,
          numbers: missing,
        });
      }
    }
  }

  /* ------------------------------ recordings ----------------------------- */

  const silent = missingAudio(content);
  if (silent.length) {
    blocking.push({
      code: 'no-recording',
      message: `${silent.map((p) => p.title).join(', ')} ${silent.length === 1 ? 'is answered' : 'are answered'} against a recording, `
        + 'and there is none. Upload one file for the whole paper, or one for each of those parts.',
      where: silent.map((p) => p.title).join(', '),
    });
  }

  /* --------------------------------- marks ------------------------------- */

  if (scoringOf(content) === 'points' && content.totalPoints) {
    const available = marksAvailable(content);
    const printed = reportedTotal(content);
    if (Math.abs(available - printed) > 0.05) {
      advisory.push({
        code: 'marks-mismatch',
        message: `The questions add up to ${Math.round(available * 100) / 100} mark(s) but the paper says it is out of ${printed}. `
          + 'Results are scaled onto the printed total, so this is only worth fixing if the printed total is wrong.',
      });
    }
  }

  const essaysWithoutLimit = questions
    .filter(({ group, q }) => FAMILY_OF[group.type] === 'essay' && !q.minWords)
    .map(({ q }) => q.number);
  if (essaysWithoutLimit.length) {
    advisory.push({
      code: 'no-word-limit',
      message: `The writing task${essaysWithoutLimit.length === 1 ? '' : 's'} at question ${essaysWithoutLimit.join(', ')} states no minimum length, `
        + 'so the marker has nothing to hold a short answer against.',
      numbers: essaysWithoutLimit,
    });
  }

  /* -------------------------------- timing ------------------------------- */

  if (!content.durationMinutes) {
    advisory.push({
      code: 'no-duration',
      message: 'This paper has no time limit, so it is sat with no clock and no automatic hand-in. '
        + 'That is right for homework and wrong for an exam — a sitting can set a time instead.',
    });
  } else if (totalQuestions(content) > 0) {
    const perQuestion = content.durationMinutes / totalQuestions(content);
    if (perQuestion < 0.4) {
      advisory.push({
        code: 'long-paper',
        message: `${totalQuestions(content)} questions in ${content.durationMinutes} minutes is under 25 seconds each. `
          + 'Check the time the paper prints.',
      });
    }
  }

  const summary = blocking.length
    ? `${blocking.length} thing${blocking.length === 1 ? '' : 's'} to fix before this can be sat`
    : advisory.length
      ? `Ready to sit, with ${advisory.length} thing${advisory.length === 1 ? '' : 's'} worth a look`
      : 'Ready to sit';

  return { blocking, advisory, summary };
}

/** True when nothing stands in the way of publishing. */
export const sittable = (content: ExamContent): boolean => preflight(content).blocking.length === 0;
