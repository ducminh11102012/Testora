/**
 * Which shelf a paper belongs on.
 *
 * A centre uploads one file and it is a whole course: thirty grammar drills,
 * four reading passages, a couple of writing tasks and a listening section.
 * Filed under the book's title alone, that is a folder with thirty-six papers
 * in it and no way to find the six that are reading — which is a folder in
 * name only. So each paper says what it is on the way in, and the bank sorts
 * itself.
 *
 * The label is taken from the paper as it was *parsed*, not from the heading
 * printed above it. A heading lies ("PART 5" says nothing about what is in it);
 * thirty multiple-choice questions with a passage above them do not.
 */

import {
  ExamContent, FAMILY_OF, QUESTION_TYPE_LABEL, QuestionType, allQuestions,
} from '@/types/exam';

const MODULE_LABEL: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  mixed: 'Mixed',
};

/**
 * The type names are the ones the editor uses, shortened where the full name
 * is a sentence. A folder name has to fit in a dropdown.
 */
const SHORT: Partial<Record<QuestionType, string>> = {
  'multiple-choice': 'Multiple choice',
  'multiple-choice-multi': 'Multiple choice',
  'multiple-choice-cloze': 'Multiple-choice cloze',
  'true-false-notgiven': 'True / False / Not Given',
  'yes-no-notgiven': 'Yes / No / Not Given',
  'summary-completion-bank': 'Summary completion',
  'error-correction': 'Error correction',
  'open-cloze': 'Open cloze',
  'writing-task': 'Writing task',
};

/** The type most of the paper's questions are, and how much of it that is. */
export function dominantType(content: ExamContent): { type: QuestionType; share: number } | null {
  const counts = new Map<QuestionType, number>();
  for (const part of content.parts) {
    for (const group of part.groups) {
      counts.set(group.type, (counts.get(group.type) ?? 0) + group.questions.length);
    }
  }
  const total = allQuestions(content).length;
  if (!total) return null;
  let best: QuestionType | null = null;
  let most = 0;
  for (const [type, n] of counts) {
    if (n > most) { most = n; best = type; }
  }
  return best ? { type: best, share: most / total } : null;
}

/**
 * The folder name for a paper: "Reading — Multiple choice".
 *
 * A paper of one kind is named for that kind. A paper that mixes kinds is named
 * for its skill alone, because "Reading — Multiple choice" on a paper that is
 * only half multiple choice would file it where it is not.
 */
export function typeFolder(content: ExamContent): string {
  const module = MODULE_LABEL[content.module] ?? 'Papers';
  const top = dominantType(content);
  if (!top) return module;

  // Writing is filed by skill: "Writing — Writing task" says nothing twice.
  if (FAMILY_OF[top.type] === 'essay') return module;

  // Under two thirds of one type is a mixed paper, whatever the largest share.
  if (top.share < 0.66) return `${module} — Mixed`;

  const label = SHORT[top.type] ?? QUESTION_TYPE_LABEL[top.type];
  return `${module} — ${label}`;
}
