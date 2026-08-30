import { ExamContent, allQuestions, renumber } from '@/types/exam';
import { Extracted, extractFile } from './extract';
import { parseAnswerKey, parseWithRules } from './rules';
import { MAX_CHARS, ProviderName, buildPrompt, callModel, configuredProvider, extractJson } from './ai';
import { normaliseContent } from './normalize';

export type Strategy = 'rules' | 'ai' | 'hybrid';

export interface ParseOutcome {
  content: ExamContent;
  warnings: string[];
  strategy: Strategy;
  usedAi: boolean;
  provider: ProviderName;
  model?: string;
  extracted: Extracted;
  ruleConfidence: number;
}

function scaffoldSummary(content: ExamContent): string {
  return content.parts
    .map((p) => {
      const groups = p.groups
        .map((g) => `    - ${g.heading ?? ''} [${g.type}] ${g.questions.length} question(s)`)
        .join('\n');
      return `  ${p.title}${p.passage ? ' (has passage)' : ''}\n${groups}`;
    })
    .join('\n');
}

/**
 * Hybrid strategy:
 *   1. always run the rule parser — it is free, instant and gives us an outline
 *      plus a reliable answer key when the paper prints one;
 *   2. hand the raw text + that outline to the model for the semantic work
 *      (task classification, gap placement, passage structure);
 *   3. merge: model structure wins, but any answer the rule pass found and the
 *      model missed is copied back in.
 */
/**
 * Papers that restart numbering in each section produce duplicate question
 * numbers, which the exam navigator keys on. Renumber the whole paper only when
 * that actually happens, so a well-numbered paper keeps its printed numbers.
 */
function ensureUniqueNumbers(content: ExamContent, warnings: string[]): ExamContent {
  const numbers = allQuestions(content).map((q) => q.number);
  if (new Set(numbers).size === numbers.length) return content;
  warnings.push('Question numbers repeated across sections, so the paper has been renumbered from 1.');
  return renumber(content);
}

export async function parseDocument(
  filename: string,
  mime: string,
  buffer: Buffer,
  opts: { strategy?: Strategy; module?: 'reading' | 'listening' | 'writing' | 'mixed'; title?: string } = {},
): Promise<ParseOutcome> {
  const extracted = await extractFile(filename, mime, buffer);
  const warnings = [...extracted.warnings];

  const baseTitle = opts.title || filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const rules = parseWithRules(extracted.text, { module: opts.module, title: baseTitle });
  warnings.push(...rules.warnings);

  const provider = configuredProvider();
  const wantAi = opts.strategy !== 'rules' && provider !== 'none';

  if (!wantAi) {
    if (opts.strategy !== 'rules' && provider === 'none') {
      warnings.push('No AI provider is configured — used the rule-based parser only. Set an API key in .env to enable the AI pass.');
    }
    return {
      content: ensureUniqueNumbers(rules.content, warnings), warnings, strategy: 'rules', usedAi: false,
      provider: 'none', extracted, ruleConfidence: rules.confidence,
    };
  }

  let text = extracted.text;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warnings.push(`The document is very long; only the first ${MAX_CHARS.toLocaleString()} characters were sent to the model.`);
  }

  try {
    const prompt = buildPrompt(text, {
      module: opts.module,
      scaffold: opts.strategy === 'ai' ? undefined : scaffoldSummary(rules.content),
    });
    const { raw, model } = await callModel(prompt, provider);
    const { content, warnings: normWarnings } = normaliseContent(extractJson(raw));
    warnings.push(...normWarnings);

    if (opts.title) content.title = opts.title;
    if (opts.module) content.module = opts.module;

    // Backfill answers the model left empty from the rule-parsed key.
    const key = { ...parseAnswerKey(extracted.text), ...rules.answerKey };
    let filled = 0;
    for (const q of allQuestions(content)) {
      if (!q.answers.length && key[q.number]?.length) { q.answers = key[q.number]; filled++; }
    }
    if (filled) warnings.push(`${filled} answer(s) were recovered from the printed answer key.`);

    const missing = allQuestions(content).filter((q) => !q.answers.length && q.points !== 0);
    if (missing.length) {
      warnings.push(`${missing.length} question(s) still have no answer key: ${missing.slice(0, 12).map((q) => q.number).join(', ')}${missing.length > 12 ? '…' : ''}`);
    }
    if (!content.parts.length) throw new Error('The model returned no parts.');

    return {
      content: ensureUniqueNumbers(content, warnings), warnings, strategy: opts.strategy ?? 'hybrid',
      usedAi: true, provider, model, extracted, ruleConfidence: rules.confidence,
    };
  } catch (err) {
    warnings.push(`AI pass failed (${(err as Error).message}). Falling back to the rule-based result.`);
    return {
      content: ensureUniqueNumbers(rules.content, warnings), warnings, strategy: 'rules', usedAi: false,
      provider, extracted, ruleConfidence: rules.confidence,
    };
  }
}

export { configuredProvider };
