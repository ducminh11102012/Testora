/**
 * Why the answer is the answer.
 *
 * A review screen that says "Incorrect" and stops there teaches nobody
 * anything — the candidate wanted to know *why*, and a teacher marking forty
 * scripts cannot write it out forty times. So the model writes an explanation
 * for each question once, when the paper is imported, and every candidate who
 * sits it afterwards gets it.
 *
 * Two rules shape the prompt. It must explain from the paper itself — pointing
 * at the line in the passage, the grammar rule, the word that gives it away —
 * and it must explain in the language the paper is written in, because a
 * Vietnamese gifted-student paper explained in English helps nobody in that
 * room.
 */

import { ExamContent, FAMILY_OF, Group, Part, Question } from '@/types/exam';
import { AiConfig, isConfigured, loadAiConfig } from './config';
import { outputCap } from './models';
import { CallContext } from './provider';
import { askJson } from './ask-json';

/** How many questions to explain in one call. */
const BATCH = 10;

const plain = (html?: string) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export interface ExplainResult {
  /** How many questions came back with an explanation. */
  written: number;
  /** Question numbers still without one. */
  missing: number[];
  warnings: string[];
  costCents: number;
}

export interface ExplainProgress {
  /** Questions dealt with so far, and how many there are in total. */
  done: number;
  total: number;
  /** The part being explained, for the line the console shows. */
  label: string;
}

/** The question types worth explaining. An essay is marked, not answered. */
function explainable(group: Group, q: Question): boolean {
  if (FAMILY_OF[group.type] === 'essay') return false;
  if (FAMILY_OF[group.type] === 'fields') return (q.fields ?? []).some((f) => f.answers.length > 0);
  return q.answers.length > 0;
}

/** What the model is shown for one batch: the text, then the questions and keys. */
function describe(part: Part, group: Group, questions: Question[]): string {
  const lines: string[] = [];
  if (part.passage?.html) lines.push('PASSAGE', plain(part.passage.html).slice(0, 14_000), '');
  if (group.bodyHtml) lines.push('TEXT WITH THE GAPS', plain(group.bodyHtml).slice(0, 8000), '');
  if (group.instructions) lines.push(`RUBRIC: ${plain(group.instructions)}`);
  if (group.bank?.length) lines.push(`SHARED LIST: ${group.bank.map((b) => `${b.label} = ${b.text}`).join(' | ')}`);
  lines.push('', 'QUESTIONS, WITH THE ACCEPTED ANSWER');
  for (const q of questions) {
    const bits = [`Q${q.number}`];
    if (q.prompt) bits.push(plain(q.prompt));
    if (q.options?.length) bits.push(`OPTIONS: ${q.options.map((o) => `${o.label}. ${o.text}`).join(' | ')}`);
    if (q.rootWord) bits.push(`WORD GIVEN: ${q.rootWord}`);
    if (q.keyWord) bits.push(`COMPULSORY WORD: ${q.keyWord}`);
    const answer = q.fields?.length
      ? q.fields.map((f) => `${f.label ?? f.key}: ${f.answers.join(' / ')}`).join('  ·  ')
      : q.answers.join(' / ');
    bits.push(`ANSWER: ${answer}`);
    lines.push(`- ${bits.join(' — ')}`);
  }
  return lines.join('\n');
}

/**
 * Writes an explanation for every question that has an answer to explain.
 *
 * Mutates `content` in place, the same way the answer-key pass does, so the
 * caller saves the paper once at the end.
 */
export async function explainAnswers(input: {
  content: ExamContent;
  ctx: CallContext;
  config?: AiConfig;
  /** Set true to rewrite explanations that are already there. */
  redo?: boolean;
  onProgress?: (progress: ExplainProgress) => void | Promise<void>;
  /** Called with the model's own output as it arrives, for the live view. */
  onDelta?: (chunk: string, soFar: string) => void;
}): Promise<ExplainResult> {
  const cfg = input.config ?? await loadAiConfig('parse');
  const warnings: string[] = [];
  if (!isConfigured(cfg) || !cfg.parsingEnabled) {
    return {
      written: 0,
      missing: [],
      warnings: ['No AI provider is configured, so no explanations were written.'],
      costCents: 0,
    };
  }

  // Everything worth explaining, grouped as it is printed.
  const jobs: Array<{ part: Part; group: Group; questions: Question[] }> = [];
  for (const part of input.content.parts) {
    for (const group of part.groups) {
      const wanted = group.questions.filter((q) => (
        explainable(group, q) && (input.redo || !q.explanation?.trim())
      ));
      for (let i = 0; i < wanted.length; i += BATCH) {
        jobs.push({ part, group, questions: wanted.slice(i, i + BATCH) });
      }
    }
  }

  const total = jobs.reduce((sum, job) => sum + job.questions.length, 0);
  if (!total) {
    return { written: 0, missing: [], warnings: ['Every question already has an explanation.'], costCents: 0 };
  }

  let written = 0;
  let done = 0;
  let costMicros = 0;
  const missing: number[] = [];

  for (const job of jobs) {
    const wanted = job.questions.map((q) => q.number);
    const prompt = `You are an examiner writing the answer explanations that go on a marked script.

${describe(job.part, job.group, job.questions)}

Write one explanation for each of these questions: ${wanted.join(', ')}.

RULES
1. Explain why the printed answer is right — from this paper. Point at the sentence in the passage,
   the grammar rule, the word that gives it away, or the option that looks right and is not.
2. Two or three sentences each. A candidate reading it should understand what to do differently next
   time, not read an essay.
3. Where the question is a choice, say briefly why the tempting wrong option is wrong.
4. Never contradict the printed answer, and never invent a line the passage does not contain.
5. **Write in the language of the paper.** A Vietnamese paper is explained in Vietnamese, an English
   paper in English. Match the paper, not this instruction.
6. Plain prose. No markdown, no headings, no bullet points, no HTML.

Return ONLY this JSON, with an entry for every number above:
{"explanations":{"<number>": string, ...}}`;

    try {
      const asked = await askJson(
        {
          system: 'You explain exam answers clearly and briefly, in the language of the paper. Return only JSON.',
          prompt,
          maxTokens: outputCap(cfg),
          temperature: 0.2,
          onDelta: input.onDelta,
        },
        { ...input.ctx, meta: { ...input.ctx.meta, part: job.part.title, questions: wanted.length } },
        cfg,
      );
      costMicros += asked.result.costMicros;

      const parsed = asked.value as { explanations?: Record<string, unknown> };
      for (const q of job.questions) {
        const text = String(parsed.explanations?.[String(q.number)] ?? '').trim();
        if (!text) { missing.push(q.number); continue; }
        // Long enough to be an explanation, short enough to read on a report.
        q.explanation = text.replace(/\s+/g, ' ').slice(0, 900);
        written += 1;
      }
    } catch (err) {
      warnings.push(`The explanations for ${job.part.title} could not be written: ${(err as Error).message}`);
      missing.push(...wanted);
    }

    done += job.questions.length;
    await input.onProgress?.({ done, total, label: job.part.title });
  }

  if (written) {
    warnings.push(
      `${written} answer explanation${written === 1 ? '' : 's'} written. Candidates see them on their `
      + 'review screen after handing in — read a few before the paper is sat.',
    );
  }
  if (missing.length) {
    warnings.push(`No explanation for question ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}.`);
  }

  return { written, missing, warnings, costCents: costMicros / 10_000 };
}

/** How many questions on this paper could carry an explanation, and how many do. */
export function explanationCoverage(content: ExamContent): { possible: number; written: number } {
  let possible = 0;
  let written = 0;
  for (const part of content.parts) {
    for (const group of part.groups) {
      for (const q of group.questions) {
        if (!explainable(group, q)) continue;
        possible += 1;
        if (q.explanation?.trim()) written += 1;
      }
    }
  }
  return { possible, written };
}
