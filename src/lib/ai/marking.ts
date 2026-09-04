import { Question } from '@/types/exam';
import { RubricCriterion } from '@/types/db';
import { AiConfig, isConfigured, loadAiConfig } from './config';
import { outputCap } from './models';
import { CallContext } from './provider';
import { askJson } from './ask-json';

export interface WritingMark {
  scores: Record<string, number>;
  comment: string;
  awarded: number;
  strengths: string[];
  improvements: string[];
}

const wordCount = (t: string) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
};

/* ------------------------------------------------------------------ */
/* Extended writing: essays, letters, reports                          */
/* ------------------------------------------------------------------ */

export async function markWriting(input: {
  taskInstructions: string;
  response: string;
  criteria: RubricCriterion[];
  points: number;
  minWords: number;
  /**
   * The marking instructions printed with this paper — usually out of its own
   * answer key. A paper's own rubric beats the platform's generic one, so it is
   * given to the marker ahead of everything else.
   */
  paperNotes?: string;
  ctx: CallContext;
  config?: AiConfig;
}): Promise<WritingMark> {
  const cfg = input.config ?? await loadAiConfig('mark');
  const criteria = input.criteria.length ? input.criteria : [
    { key: 'task', label: 'Task response', max: 9 },
    { key: 'coherence', label: 'Coherence and cohesion', max: 9 },
    { key: 'lexis', label: 'Lexical resource', max: 9 },
    { key: 'grammar', label: 'Grammatical range and accuracy', max: 9 },
  ];

  const paperRubric = (input.paperNotes ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const prompt = `Mark this candidate's written response.
${paperRubric ? `
MARKING INSTRUCTIONS PRINTED WITH THIS PAPER — they come from the paper's own answer key and take
precedence over the general criteria below wherever the two disagree:
"""
${paperRubric.slice(0, 4000)}
"""
` : ''}
TASK SET TO THE CANDIDATE
${input.taskInstructions.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}

REQUIRED LENGTH: at least ${input.minWords} words. The response is ${wordCount(input.response)} words.

CANDIDATE'S RESPONSE
"""
${input.response.slice(0, 12000)}
"""

CRITERIA — score each one on its own scale:
${criteria.map((c) => `- ${c.key} — ${c.label} (0 to ${c.max})${c.descriptors ? `: ${c.descriptors}` : ''}`).join('\n')}

RULES
1. Mark only what the candidate actually wrote. Never credit ideas they did not express.
2. A response well under the required length cannot reach the upper bands for task response.
3. A response that does not address the task set cannot pass task response, however well written.
4. Copying the prompt wording back does not count as the candidate's own language.
5. Comment in clear English addressed to the candidate, two or three sentences, specific to their text.
6. Give two concrete strengths and two concrete things to fix, each quoting or naming something in the response.

Return ONLY this JSON:
{"scores":{${criteria.map((c) => `"${c.key}":number`).join(',')}},
 "comment":string,"strengths":[string,string],"improvements":[string,string]}`;

  const asked = await askJson(
    { system: cfg.markingGuidance, prompt, maxTokens: outputCap(cfg, 1500), temperature: 0 },
    input.ctx, cfg,
  );
  const result = asked.result;

  const parsed = asked.value as Partial<WritingMark> & { scores?: Record<string, number> };
  const scores: Record<string, number> = {};
  for (const c of criteria) {
    const value = Number(parsed.scores?.[c.key] ?? 0);
    scores[c.key] = Math.max(0, Math.min(c.max, Number.isFinite(value) ? value : 0));
  }

  // The rubric average, scaled to the marks the task is worth.
  const mean = criteria.reduce((sum, c) => sum + scores[c.key], 0) / criteria.length;
  const maxMean = criteria.reduce((sum, c) => sum + c.max, 0) / criteria.length;
  const awarded = Math.round((mean / maxMean) * input.points * 10) / 10;

  return {
    scores,
    comment: String(parsed.comment ?? '').slice(0, 1200),
    strengths: (parsed.strengths ?? []).map(String).slice(0, 3),
    improvements: (parsed.improvements ?? []).map(String).slice(0, 3),
    awarded,
  };
}

/* ------------------------------------------------------------------ */
/* Sentence transformation                                             */
/* ------------------------------------------------------------------ */

export interface TransformVerdict { correct: boolean; reason: string }

/**
 * Transformations have too many valid wordings to list, so the model decides
 * whether the candidate's rewrite means the same thing. The hard constraints —
 * the compulsory word and the word limit — are still checked in code, because
 * they are rules rather than judgements.
 */
export async function judgeTransformation(input: {
  question: Question;
  given: string;
  ctx: CallContext;
  config?: AiConfig;
}): Promise<TransformVerdict> {
  const { question: q, given } = input;

  const words = wordCount(given);
  if (q.minWords && words < q.minWords) return { correct: false, reason: `Too short: ${words} words, minimum ${q.minWords}.` };
  if (q.maxWords && words > q.maxWords) return { correct: false, reason: `Too long: ${words} words, maximum ${q.maxWords}.` };
  if (q.keyWord && !given.toLowerCase().split(/[^a-zà-ỹ']+/i).includes(q.keyWord.toLowerCase())) {
    return { correct: false, reason: `The compulsory word "${q.keyWord}" was not used unchanged.` };
  }

  const cfg = input.config ?? await loadAiConfig('mark');
  const prompt = `Decide whether a candidate's sentence transformation is acceptable.

ORIGINAL SENTENCE: ${q.prompt ?? ''}
COMPULSORY WORD: ${q.keyWord ?? '(none)'}
MODEL ANSWERS THE PAPER ACCEPTS: ${q.answers.join(' / ') || '(none supplied)'}
CANDIDATE WROTE: ${given}

Accept the answer when it means the same as the original, uses the compulsory word unchanged, and is
grammatically correct English. Reject it for a change of meaning, a grammatical error, or a missing or
altered compulsory word. A wording that differs from the model answers is fine if it satisfies those tests.

Return ONLY: {"correct":boolean,"reason":string}  — reason in one short sentence for the candidate.`;

  const asked = await askJson(
    { system: 'You are a precise English examiner. Return only JSON.', prompt, maxTokens: 300 },
    input.ctx, cfg,
  );
  const parsed = asked.value as Partial<TransformVerdict>;
  return { correct: !!parsed.correct, reason: String(parsed.reason ?? '').slice(0, 300) };
}

export async function aiMarkingAvailable(config?: AiConfig): Promise<boolean> {
  const cfg = config ?? await loadAiConfig('mark');
  return isConfigured(cfg) && cfg.writingMarkingEnabled;
}

export async function aiJudgingAvailable(config?: AiConfig): Promise<boolean> {
  const cfg = config ?? await loadAiConfig('mark');
  return isConfigured(cfg) && cfg.transformJudgingEnabled;
}
