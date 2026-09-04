import { ExamContent, FAMILY_OF, Group, Part, Question } from '@/types/exam';
import { AiConfig, isConfigured, loadAiConfig } from './config';
import { outputCap } from './models';
import { CallContext } from './provider';
import { askJson } from './ask-json';

/**
 * Papers arrive without a key more often than not: a teacher's mock, a scanned
 * provincial paper, an exercise pulled out of a textbook. The rule engine reads
 * a printed key when there is one; when there is not, the model supplies it
 * here, and every answer it invents is marked as such so staff can check it
 * before the paper is used.
 */

/** A question the algorithm could never mark, because there is nothing to mark against. */
function needsKey(group: Group, q: Question): boolean {
  const family = FAMILY_OF[group.type];
  if (family === 'essay') return false;            // marked against a rubric
  if (family === 'transform') return q.answers.length === 0; // a model answer still helps
  if (family === 'fields') return (q.fields ?? []).some((f) => f.answers.length === 0);
  return q.answers.length === 0;
}

const plain = (html?: string) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** What the model is shown for one part: its passage and the questions in it. */
function describe(part: Part, groups: Group[]): string {
  const lines: string[] = [];
  if (part.passage?.html) {
    lines.push('PASSAGE / TEXT', plain(part.passage.html).slice(0, 12000), '');
  }
  for (const g of groups) {
    lines.push(`TASK: ${g.heading ?? g.type} (${g.type})`);
    if (g.instructions) lines.push(`RUBRIC: ${plain(g.instructions)}`);
    if (g.bank?.length) lines.push(`LIST OF OPTIONS: ${g.bank.map((b) => `${b.label} = ${b.text}`).join(' | ')}`);
    if (g.bodyHtml) lines.push(`TEXT WITH GAPS: ${plain(g.bodyHtml).slice(0, 6000)}`);
    for (const q of g.questions) {
      const bits = [`Q${q.number}`];
      if (q.prompt) bits.push(plain(q.prompt));
      if (q.options?.length) bits.push(`OPTIONS: ${q.options.map((o) => `${o.label}. ${o.text}`).join(' | ')}`);
      if (q.keyWord) bits.push(`COMPULSORY WORD: ${q.keyWord}`);
      if (q.rootWord) bits.push(`ROOT WORD: ${q.rootWord}`);
      if (q.fields?.length) bits.push(`COLUMNS: ${q.fields.map((f) => f.label ?? f.key).join(' | ')}`);
      if (q.maxWords) bits.push(`AT MOST ${q.maxWords} WORDS`);
      lines.push(bits.join(' — '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

export interface KeyFillResult {
  filled: number;
  missing: number[];
  warnings: string[];
}

/**
 * Fills in every accepted answer the paper did not come with. Answers are
 * written into `content` in place; the numbers it could not answer come back so
 * the import can say so.
 */
export async function fillMissingAnswers(input: {
  content: ExamContent;
  ctx: CallContext;
  config?: AiConfig;
  /** The model's output as it arrives, for the console's live view. */
  onDelta?: (chunk: string, soFar: string) => void;
}): Promise<KeyFillResult> {
  const cfg = input.config ?? await loadAiConfig('parse');
  const warnings: string[] = [];
  if (!isConfigured(cfg)) {
    return { filled: 0, missing: [], warnings: ['No AI provider is configured, so the missing answers were left blank.'] };
  }

  const byNumber = new Map<number, { group: Group; q: Question }>();
  for (const part of input.content.parts) {
    for (const group of part.groups) {
      for (const q of group.questions) byNumber.set(q.number, { group, q });
    }
  }

  let filled = 0;
  const stillMissing: number[] = [];

  // One call per part, so the model sees the passage the answers come from.
  for (const part of input.content.parts) {
    const groups = part.groups.filter((g) => g.questions.some((q) => needsKey(g, q)));
    if (!groups.length) continue;

    const wanted = groups.flatMap((g) => g.questions.filter((q) => needsKey(g, q)).map((q) => q.number));
    const prompt = `You are writing the answer key for an English examination paper. The paper came
without one, so work the answers out from the text.

${describe(part, groups)}
Answer ONLY these questions: ${wanted.join(', ')}.

RULES
1. For a multiple-choice or matching question, the answer is the option LETTER exactly as printed (A, B, iii …).
2. For a gap or short answer, give the exact word or words from the text, in the same form the text uses,
   obeying any word limit in the rubric. Where more than one wording is genuinely acceptable, separate them
   with " | " — but only where the paper's own rubric would accept both.
3. For a sentence transformation, give one correct full sentence that uses the compulsory word unchanged.
4. For an error-correction row, give one answer per column, in the column order shown.
5. If the text genuinely does not settle a question, return an empty string for it rather than guessing.

Return ONLY this JSON, with a key for every question number listed above:
{"answers":{"<number>": string | string[], ...}}`;

    try {
      const asked = await askJson(
        {
          system: 'You are a meticulous examiner writing an answer key. Return only JSON.',
          prompt, maxTokens: outputCap(cfg), temperature: 0,
          onDelta: input.onDelta,
        },
        { ...input.ctx, meta: { ...input.ctx.meta, part: part.title, questions: wanted.length } },
        cfg,
      );
      const parsed = asked.value as { answers?: Record<string, unknown> };
      const answers = parsed.answers ?? {};

      for (const number of wanted) {
        const entry = byNumber.get(number);
        if (!entry) continue;
        const raw = answers[String(number)];
        const values = (Array.isArray(raw) ? raw : [raw])
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0 && v !== '-');

        if (!values.length) { stillMissing.push(number); continue; }

        if (FAMILY_OF[entry.group.type] === 'fields' && entry.q.fields?.length) {
          entry.q.fields = entry.q.fields.map((f, i) => (
            f.answers.length ? f : { ...f, answers: values[i] ? [values[i]] : [] }
          ));
          if (entry.q.fields.some((f) => !f.answers.length)) stillMissing.push(number);
          else { filled += 1; entry.q.markingNote = aiNote(entry.q.markingNote); }
          continue;
        }

        entry.q.answers = values;
        entry.q.markingNote = aiNote(entry.q.markingNote);
        filled += 1;
      }
    } catch (err) {
      warnings.push(`The answer key for ${part.title} could not be written: ${(err as Error).message}`);
      stillMissing.push(...wanted);
    }
  }

  if (filled) {
    warnings.push(
      `${filled} answer${filled === 1 ? '' : 's'} were written by the model because the paper had none. `
      + 'They are marked "answer supplied by AI" in the editor — check them before the paper is sat.',
    );
  }
  if (stillMissing.length) {
    warnings.push(`Still without an answer: ${stillMissing.sort((a, b) => a - b).join(', ')}.`);
  }
  return { filled, missing: stillMissing, warnings };
}

const AI_NOTE = 'Answer supplied by AI — please check.';
const aiNote = (existing?: string) => (existing ? `${existing} ${AI_NOTE}` : AI_NOTE);

/** How many questions in a paper still have nothing to mark against. */
export function countMissingAnswers(content: ExamContent): number {
  let n = 0;
  for (const part of content.parts) {
    for (const group of part.groups) {
      for (const q of group.questions) if (needsKey(group, q)) n += 1;
    }
  }
  return n;
}

export { needsKey, AI_NOTE };

/* ------------------------ a key that came separately -------------------- */

export interface ReadKeyResult {
  /** Question number → the accepted answers printed for it. */
  answers: Record<number, string[]>;
  /** The marking instructions printed with the key, when there are any. */
  markingNotes?: string;
  warnings: string[];
  costCents: number;
}

/**
 * Reads an answer key that arrived as its own file.
 *
 * Papers are published this way all the time — the paper for the candidates,
 * the key for the teacher — and the rule parser can only read a key laid out
 * the way it expects. This hands the printed key to the model with the list of
 * question numbers it has to account for, and asks for two things back: the
 * answers, and any marking instructions printed alongside them.
 *
 * Those instructions matter more than they look. A key for a Vietnamese paper
 * routinely carries the essay rubric — "Nội dung 2,0đ · Ngôn ngữ 1,5đ · Hình
 * thức 0,5đ", how spelling is treated, what earns full marks — and that rubric
 * is the one the school marks by.
 */
export async function readAnswerKey(input: {
  keyText: string;
  /** The question numbers the key has to cover. */
  numbers: number[];
  ctx: CallContext;
  config?: AiConfig;
}): Promise<ReadKeyResult> {
  const cfg = input.config ?? await loadAiConfig('parse');
  const warnings: string[] = [];
  const text = input.keyText.trim();
  if (!text) return { answers: {}, warnings: [], costCents: 0 };
  if (!isConfigured(cfg) || !cfg.parsingEnabled) {
    return {
      answers: {},
      warnings: ['The answer-key file could not be read by a model — only what the rule parser recognised was used.'],
      costCents: 0,
    };
  }

  const answers: Record<number, string[]> = {};
  let costMicros = 0;
  let markingNotes: string | undefined;

  // A key for a long paper is still short, but a key for a book is not, so it
  // is read in slices of question numbers rather than in one call.
  const BATCH = 80;
  for (let i = 0; i < input.numbers.length; i += BATCH) {
    const wanted = input.numbers.slice(i, i + BATCH);
    const prompt = `Below is the printed ANSWER KEY for an exam paper, exactly as it was published —
often a separate document from the paper itself, sometimes a table, sometimes a list.

Read it and return the accepted answers for these question numbers: ${wanted.join(', ')}.

RULES
1. Copy what the key says. Never work an answer out for yourself, and never guess: a number the key
   does not cover gets an empty string.
2. A multiple-choice or matching answer is the printed LETTER (A, B, iii …). A gap answer is the
   printed word or words, exactly as written.
3. Where the key offers alternatives ("colour/color", "in 1908 OR 1908"), separate them with " | ".
4. A row with two columns per question (a mistake and its correction) becomes an array of the two,
   in the printed order.
5. Some keys carry MARKING INSTRUCTIONS as well as answers — how the essay is marked, what each
   criterion is worth, how spelling is treated, what earns full marks. Copy that text verbatim into
   "markingNotes"${i > 0 ? ' (leave it empty if you already have none in this slice)' : ''}. Do not
   summarise it, do not invent it, and leave it empty if the key has none.

Return ONLY this JSON:
{"answers":{"<number>": string | string[], ...}, "markingNotes": string}

PRINTED ANSWER KEY
---
${text.slice(0, 60_000)}
---`;

    try {
      const asked = await askJson(
        {
          system: 'You transcribe printed answer keys. You copy, you never solve. Return only JSON.',
          prompt,
          maxTokens: outputCap(cfg),
          temperature: 0,
        },
        { ...input.ctx, meta: { ...input.ctx.meta, keyQuestions: wanted.length } },
        cfg,
      );
      costMicros += asked.result.costMicros;
      const parsed = asked.value as {
        answers?: Record<string, unknown>;
        markingNotes?: unknown;
      };
      for (const number of wanted) {
        const raw = parsed.answers?.[String(number)];
        const values = (Array.isArray(raw) ? raw : [raw])
          .map((v) => String(v ?? '').trim())
          .filter((v) => v.length > 0 && v !== '-');
        if (values.length) answers[number] = values;
      }
      const notes = String(parsed.markingNotes ?? '').trim();
      if (notes && !markingNotes) markingNotes = notes.slice(0, 4000);
    } catch (err) {
      warnings.push(`Part of the answer-key file could not be read (${(err as Error).message}).`);
    }
  }

  const found = Object.keys(answers).length;
  if (found) {
    warnings.push(
      `${found} answer${found === 1 ? '' : 's'} were taken from the answer-key file you uploaded.`,
    );
  } else {
    warnings.push('No answers could be matched to this paper from the answer-key file.');
  }
  if (markingNotes) {
    warnings.push('The answer key also carried marking instructions, which are now on the paper and go to the marker.');
  }

  return { answers, markingNotes, warnings, costCents: costMicros / 10_000 };
}
