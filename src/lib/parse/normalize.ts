import { z } from 'zod';
import { uid } from '../utils';
import { ExamContent, FAMILY_OF, FIXED_OPTIONS, Group, QuestionType } from '@/types/exam';

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
});

const zGroup = z.object({
  id: z.string().optional(),
  type: z.string(),
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
  durationMinutes: z.coerce.number().int().positive().default(60),
  transferMinutes: z.coerce.number().int().nullish(),
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
        if (family === 'choice' && !fixed && (!options || options.length < 2)) {
          warnings.push(`Question ${q.number} is multiple choice but has no options.`);
        }
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
          keyWord: q.keyWord ?? undefined,
          leadIn: q.leadIn ?? undefined,
          tail: q.tail ?? undefined,
          selectCount: q.selectCount ?? undefined,
          maxWords: q.maxWords ?? undefined,
          minWords: q.minWords ?? undefined,
          points: q.points ?? 1,
        };
      });
      return {
        id: g.id || uid('grp'),
        type,
        heading: g.heading ?? undefined,
        instructions: g.instructions ?? undefined,
        bank: g.bank?.length ? g.bank.map((b) => ({ label: b.label, text: b.text })) : undefined,
        bodyHtml: g.bodyHtml ?? undefined,
        imageUrl: g.imageUrl ?? undefined,
        fieldColumns: g.fieldColumns ?? undefined,
        questions,
      };
    }),
  }));

  // Gap groups must have a placeholder for each of their questions.
  for (const p of parts) {
    for (const g of p.groups) {
      if (FAMILY_OF[g.type] === 'gap' && g.bodyHtml) {
        for (const q of g.questions) {
          if (!g.bodyHtml.includes(`[[${q.number}]]`) && !q.prompt) {
            warnings.push(`Gap [[${q.number}]] is missing from its text block.`);
          }
        }
      }
    }
  }

  const content: ExamContent = {
    title: parsed.title,
    module: parsed.module,
    variant: parsed.variant ?? 'academic',
    durationMinutes: parsed.durationMinutes,
    transferMinutes: parsed.transferMinutes ?? 0,
    parts,
  };
  return { content, warnings };
}
