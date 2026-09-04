/**
 * Writing a paper to order.
 *
 * A centre with nothing to upload — or a candidate who has run out of papers —
 * can describe what they want and have the model write it. The result goes
 * through exactly the same normalisation, repair and answer-key checks as an
 * imported paper, because from that point on it is an ordinary paper.
 */

import { ExamContent, totalQuestions } from '@/types/exam';
import { buildComposePrompt } from '../parse/ai';
import { normaliseContent } from '../parse/normalize';
import { AiConfig, isConfigured, loadAiConfig } from './config';
import { outputCap } from './models';
import { CallContext, callModel } from './provider';
import { askJson } from './ask-json';

export interface ComposeRequest {
  /** What the operator or candidate asked for, in their own words. */
  instructions: string;
  /** A paper of the kind they want, pasted in or read from an upload. */
  sample?: string;
  module?: 'reading' | 'listening' | 'writing' | 'mixed';
  questions?: number;
  minutes?: number;
  scoring?: 'band' | 'points';
  totalPoints?: number;
  title?: string;
  /** The model's output as it arrives, for the console's live view. */
  onDelta?: (chunk: string, soFar: string) => void;
}

export interface ComposeResult {
  content: ExamContent;
  warnings: string[];
  provider: string;
  model: string;
  costCents: number;
}

export async function composePaper(
  req: ComposeRequest,
  ctx: CallContext,
  config?: AiConfig,
): Promise<ComposeResult> {
  const cfg = config ?? await loadAiConfig('parse');
  if (!isConfigured(cfg)) {
    throw new Error('No AI provider is configured, so a paper cannot be written. Ask a platform administrator to set one up.');
  }
  if (!cfg.parsingEnabled) {
    throw new Error('AI paper writing is switched off for this platform.');
  }
  const instructions = req.instructions.trim();
  if (instructions.length < 10) {
    throw new Error('Say a little more about the paper you want — the subject, the level, and the kind of tasks.');
  }

  const warnings: string[] = [];
  const asked = await askJson(
    {
      prompt: buildComposePrompt({ ...req, instructions }),
      system: 'You write complete exam papers, with an answer for every question, and return only valid JSON.',
      maxTokens: outputCap(cfg),
      // A paper the model has to invent needs a little room to be interesting;
      // a paper it has to transcribe does not. This is the one call that is not
      // asked for at temperature zero.
      temperature: 0.4,
      onDelta: req.onDelta,
    },
    ctx,
    cfg,
  );

  const result = asked.result;
  warnings.push(...asked.warnings);
  const { content, warnings: normWarnings } = normaliseContent(asked.value);
  warnings.push(...normWarnings);
  if (req.title) content.title = req.title;
  if (req.module) content.module = req.module;
  if (!content.scoring) content.scoring = req.scoring ?? 'points';

  if (!content.parts.length || totalQuestions(content) === 0) {
    throw new Error('The model did not return a usable paper. Try again, saying more about what you want.');
  }

  return {
    content,
    warnings,
    provider: result.provider,
    model: result.model,
    costCents: result.costMicros / 10_000,
  };
}
