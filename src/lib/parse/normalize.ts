import { z } from 'zod';
import { uid } from '../utils';
import {
  ExamContent, FAMILY_OF, FIXED_OPTIONS, Group, Part, Question, QuestionType, renumber,
} from '@/types/exam';
import { splitInlineOptions } from './rules';

const TYPE_VALUES = Object.keys(FAMILY_OF) as [QuestionType, ...QuestionType[]];

const zOption = z.object({ label: z.string(), text: z.string().default('') });

const zField = z.object({
  key: z.string(),
  label: z.string().nullish(),
  answers: z.array(z.string()).default([]),
  width: z.coerce.number().nullish(),
  placeholder: z.string().nullish(),
});

const zQuestion = z.object({
  id: z.string().optional(),
  number: z.coerce.number().int().positive(),
  prompt: z.string().nullish(),
  options: z.array(zOption).nullish(),
  answers: z.array(z.string()).nullish(),
  fields: z.array(zField).nullish(),
  rootWord: z.string().nullish(),
  keyWord: z.string().nullish(),
  leadIn: z.string().nullish(),
  tail: z.string().nullish(),
  selectCount: z.coerce.number().int().nullish(),
  maxWords: z.coerce.number().int().nullish(),
  minWords: z.coerce.number().int().nullish(),
  points: z.coerce.number().nullish(),
  markingNote: z.string().nullish(),
  explanation: z.string().nullish(),
});

const zGroup = z.object({
  id: z.string().optional(),
  type: z.string(),
  optionLayout: z.enum(['auto', 'row', 'stack']).nullish(),
  heading: z.string().nullish(),
  instructions: z.string().nullish(),
  bank: z.array(zOption).nullish(),
  bodyHtml: z.string().nullish(),
  imageUrl: z.string().nullish(),
  fieldColumns: z.array(z.string()).nullish(),
  questions: z.array(zQuestion).default([]),
});

const zPart = z.object({
  id: z.string().optional(),
  title: z.string().default('Part'),
  listening: z.coerce.boolean().nullish(),
  audioPlayOnce: z.coerce.boolean().nullish(),
  section: z.string().nullish(),
  points: z.coerce.number().nullish(),
  instructions: z.string().nullish(),
  passage: z.object({ title: z.string().nullish(), html: z.string().default('') }).nullish(),
  audioUrl: z.string().nullish(),
  groups: z.array(zGroup).default([]),
});

export const zExamContent = z.object({
  title: z.string().default('Imported test'),
  module: z.enum(['reading', 'listening', 'writing', 'mixed']).default('reading'),
  variant: z.enum(['academic', 'general', 'school']).nullish(),
  scoring: z.enum(['band', 'points']).nullish(),
  totalPoints: z.coerce.number().nonnegative().nullish(),
  // Zero is meaningful: a paper that states no time is imported without one.
  durationMinutes: z.coerce.number().int().min(0).default(0),
  transferMinutes: z.coerce.number().int().nullish(),
  description: z.string().nullish(),
  // One recording for the whole paper, and the marking instructions printed in
  // its answer key. Both are attached after parsing, and every save normalises
  // the paper again, so they have to be part of the shape or they are lost.
  audioUrl: z.string().nullish(),
  audioPlayOnce: z.coerce.boolean().nullish(),
  markingNotes: z.string().nullish(),
  parts: z.array(zPart).default([]),
});

/** Coerce a loosely-typed model response into a valid ExamContent. */
export function normaliseContent(input: unknown): { content: ExamContent; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = zExamContent.parse(input);

  const parts = parsed.parts.map((p, pi) => ({
    id: p.id || uid('part'),
    title: p.title || `Part ${pi + 1}`,
    section: p.section ?? undefined,
    points: p.points ?? undefined,
    instructions: p.instructions ?? '',
    passage: p.passage && p.passage.html ? { title: p.passage.title ?? undefined, html: p.passage.html } : undefined,
    audioUrl: p.audioUrl ?? undefined,
    // Both of these are set outside the parser — by the audio upload and by the
    // listening split — and dropping them here silently un-marked a listening
    // part on the first save, which took its play-once notice with it.
    listening: p.listening ?? undefined,
    audioPlayOnce: p.audioPlayOnce ?? undefined,
    groups: p.groups.map((g): Group => {
      let type = g.type as QuestionType;
      if (!TYPE_VALUES.includes(type)) {
        warnings.push(`Unknown question type "${g.type}" in ${g.heading ?? 'a group'} — treated as sentence completion.`);
        type = 'sentence-completion';
      }
      const family = FAMILY_OF[type];
      const questions = g.questions.map((q) => {
        let options = q.options?.map((o) => ({ label: o.label, text: o.text })) ?? undefined;
        const fixed = FIXED_OPTIONS[type];
        if (fixed) options = fixed.map((t) => ({ label: t, text: t }));
        // Missing options are reported by the repair pass below, which also
        // tries to recover them from the question text.
        return {
          id: q.id || uid('q'),
          number: q.number,
          prompt: q.prompt ?? undefined,
          options,
          answers: (q.answers ?? []).filter((a) => a && a.trim().length),
          fields: q.fields?.length
            ? q.fields.map((f) => ({
                key: f.key,
                label: f.label ?? undefined,
                answers: (f.answers ?? []).filter(Boolean),
                width: f.width ?? undefined,
                placeholder: f.placeholder ?? undefined,
              }))
            : undefined,
          rootWord: q.rootWord ?? undefined,
          // Written after the parse — by the answer-key pass, or on demand —
          // and every save normalises the paper again, so they have to survive.
          markingNote: q.markingNote ?? undefined,
          explanation: q.explanation ?? undefined,
          keyWord: q.keyWord ?? undefined,
          leadIn: q.leadIn ?? undefined,
          tail: q.tail ?? undefined,
          selectCount: q.selectCount ?? undefined,
          maxWords: q.maxWords ?? undefined,
          minWords: q.minWords ?? undefined,
          // Deliberately left unset when the paper printed no mark against the
          // question: that is what lets a section's total be shared out below,
          // and everything downstream already reads a missing mark as one.
          points: q.points ?? undefined,
        };
      });
      return {
        id: g.id || uid('grp'),
        type,
        heading: g.heading ?? undefined,
        optionLayout: g.optionLayout ?? undefined,
        instructions: g.instructions ?? undefined,
        bank: g.bank?.length ? g.bank.map((b) => ({ label: b.label, text: b.text })) : undefined,
        bodyHtml: g.bodyHtml ?? undefined,
        imageUrl: g.imageUrl ?? undefined,
        fieldColumns: g.fieldColumns ?? undefined,
        questions,
      };
    }),
  }));

  // Numbers must be settled before the repair pass, because the repair works out
  // which gaps line up with which question.
  const numbers = parts.flatMap((p) => p.groups.flatMap((g) => g.questions.map((q) => q.number)));
  if (new Set(numbers).size !== numbers.length) {
    warnings.push('Question numbers repeated across sections, so the paper has been renumbered from 1.');
    renumber({ parts } as ExamContent);
  }

  shareOutMarks(parts as Part[], warnings);
  repairForDisplay(parts as Part[], warnings);

  const content: ExamContent = {
    title: parsed.title,
    module: parsed.module,
    variant: parsed.variant ?? 'academic',
    scoring: parsed.scoring ?? undefined,
    totalPoints: parsed.totalPoints ?? undefined,
    durationMinutes: parsed.durationMinutes,
    transferMinutes: parsed.transferMinutes ?? 0,
    description: parsed.description ?? undefined,
    // Set outside the parser and normalised again on every save, so they have
    // to survive the trip: one recording for the whole paper, and the marking
    // instructions read out of its answer key.
    audioUrl: parsed.audioUrl ?? undefined,
    audioPlayOnce: parsed.audioPlayOnce ?? undefined,
    markingNotes: parsed.markingNotes ?? undefined,
    parts,
  };
  return { content, warnings };
}

/* ------------------------------------------------------------------ */
/* Making a parsed paper answerable                                    */
/* ------------------------------------------------------------------ */

const MARKER = /\[\[(\d{1,3})\]\]/g;

const markersIn = (html: string): Set<number> => {
  const found = new Set<number>();
  for (const m of html.matchAll(MARKER)) found.add(Number(m[1]));
  return found;
};

/**
 * A parse is only useful if the candidate can actually answer it. A paper that
 * comes back with a multiple-choice group and no options, or a matching task
 * with no list to match against, would render as unanswerable text — so each
 * group is repaired here, and where it cannot be repaired its type is changed
 * to one that always has an input. Every change is reported as a warning, so
 * staff can see what the parse got wrong.
 */
export function repairForDisplay(parts: Part[], warnings: string[]): void {
  for (const part of parts) {
    for (const group of part.groups) {
      const family = FAMILY_OF[group.type];
      const fixed = FIXED_OPTIONS[group.type];

      // 1. Choice questions whose options are still stuck in the prompt.
      if (family === 'choice' && !fixed) {
        for (const q of group.questions) {
          if ((q.options?.length ?? 0) >= 2 || !q.prompt) continue;
          const split = splitInlineOptions(q.prompt);
          if (split.options.length >= 2) {
            q.prompt = split.stem;
            q.options = split.options;
            if (!group.optionLayout) group.optionLayout = 'row';
            warnings.push(`Question ${q.number}: the options were run into the question text and have been split out — check them.`);
          }
        }
        const withoutOptions = group.questions.filter((q) => (q.options?.length ?? 0) < 2);
        if (withoutOptions.length === group.questions.length && group.questions.length > 0) {
          group.type = 'short-answer';
          warnings.push(`${group.heading ?? 'A group'}: no options could be read, so it is now a typed-answer task. Add the options in the editor to turn it back into multiple choice.`);
        } else if (withoutOptions.length) {
          warnings.push(`Question${withoutOptions.length > 1 ? 's' : ''} ${withoutOptions.map((q) => q.number).join(', ')}: no options were found — the candidate gets a text box until you add them.`);
        }
      }

      // 2. Matching tasks with nothing to match against.
      if (FAMILY_OF[group.type] === 'bank' && !group.bank?.length) {
        group.type = 'sentence-completion';
        warnings.push(`${group.heading ?? 'A matching group'}: the list of options is missing, so it is now a typed-answer task.`);
      }

      // 3. A text block whose gaps do not line up with the questions.
      if (group.bodyHtml) {
        const marks = markersIn(group.bodyHtml);
        if (marks.size === 0) {
          // Not a gap template at all: keep the text, show the questions below it.
          if (group.questions.length) {
            warnings.push(`${group.heading ?? 'A group'}: its text block had no numbered gaps, so the questions are asked underneath it.`);
          }
        } else {
          const missing = group.questions.filter((q) => !marks.has(q.number));
          if (missing.length) {
            warnings.push(`Question${missing.length > 1 ? 's' : ''} ${missing.map((q) => q.number).join(', ')}: no gap for them in the text, so they are asked underneath it.`);
          }
          const spare = [...marks].filter((n) => !group.questions.some((q) => q.number === n));
          if (spare.length) {
            // A gap with no question behind it can never be answered; take it out.
            group.bodyHtml = group.bodyHtml.replace(MARKER, (m, n) => (spare.includes(Number(n)) ? '______' : m));
            warnings.push(`The text block had gap${spare.length > 1 ? 's' : ''} ${spare.join(', ')} with no matching question; they are shown as blanks.`);
          }
        }
      }

      // 4. Error-correction rows need at least one box to type in.
      if (FAMILY_OF[group.type] === 'fields') {
        for (const q of group.questions) {
          if (!q.fields?.length) {
            q.fields = [{ key: 'answer', label: group.fieldColumns?.[0] ?? 'Correction', answers: q.answers ?? [] }];
            warnings.push(`Question ${q.number}: no columns were read, so it has one correction box.`);
          }
        }
      }

      // 5. A cloze gap with no options behind it: the renderer falls back to a
      //    text box, which is worth saying out loud.
      if (FAMILY_OF[group.type] === 'cloze') {
        const bare = group.questions.filter((q) => (q.options?.length ?? 0) < 2);
        if (bare.length) {
          warnings.push(`Question${bare.length > 1 ? 's' : ''} ${bare.map((q) => q.number).join(', ')}: no options for the gap — the candidate types the answer instead.`);
        }
      }

      // 6. An empty group is nothing but a heading; say so rather than
      //    rendering a blank space.
      if (!group.questions.length) {
        warnings.push(`${group.heading ?? 'A group'} came out with no questions at all.`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Marks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Papers print marks by section far more often than by question — "SECTION B:
 * LEXICO-GRAMMAR (30 points)", "Phần II (4,0 điểm)". Where that is all there is,
 * the section's marks are shared out evenly across its questions so the paper
 * still adds up to what it says it is worth; the remainder goes to the first
 * questions rather than being lost to rounding.
 */
export function shareOutMarks(parts: Part[], warnings: string[]): void {
  for (const part of parts) {
    const questions = part.groups.flatMap((g) => g.questions);
    if (!questions.length) continue;

    const stated = part.points ?? 0;
    if (stated <= 0) continue;

    // Respect marks the paper printed against individual questions.
    const alreadyMarked = questions.filter((q) => typeof q.points === 'number' && q.points > 0);
    if (alreadyMarked.length === questions.length) {
      const sum = alreadyMarked.reduce((t, q) => t + (q.points ?? 0), 0);
      if (Math.abs(sum - stated) > 0.05) {
        warnings.push(
          `${part.title}: the questions add up to ${round2(sum)} but the paper says ${stated}. `
          + 'The printed question marks were kept — check the section total in the editor.',
        );
      }
      continue;
    }

    // Round the share DOWN, then hand the remainder out a penny at a time, so a
    // section never comes to more than the paper says it is worth.
    const share = floor2(stated / questions.length);
    let remainder = round2(stated - share * questions.length);
    for (const q of questions) {
      let value = share;
      if (remainder > 0.004) {
        const step = Math.min(0.01, remainder);
        value = round2(value + step);
        remainder = round2(remainder - step);
      }
      q.points = value;
    }
    warnings.push(
      `${part.title} is worth ${stated} point(s) and has ${questions.length} question(s), `
      + `so each is worth ${share}.`,
    );
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const floor2 = (n: number) => Math.floor(n * 100) / 100;
