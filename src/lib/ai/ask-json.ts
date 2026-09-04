/**
 * Asking a model for JSON, and coping with what comes back instead.
 *
 * A paper is read by asking for a JSON document. When that fails, the failure
 * used to arrive as five words — *"The model did not return JSON."* — and the
 * import quietly fell back to the rule parser. Which leaves whoever uploaded
 * the paper with nothing to act on: was the key wrong, the model wrong, the
 * server wrong, the paper too long?
 *
 * So every JSON call goes through here, and two things happen that did not:
 *
 *   1. **It is asked again**, once, without the wire's JSON mode and with the
 *      instruction in words. A surprising number of servers that advertise the
 *      OpenAI wire either reject `response_format` or accept it and answer with
 *      an empty string; the second ask is what gets an answer out of those.
 *   2. **The failure says what happened** — the model's own first words, why it
 *      stopped, whether it spent its whole budget on reasoning and left no
 *      room for the answer.
 */

import { CallContext, ModelCall, ModelResult, callModel } from './provider';
import { AiConfig } from './models';
import { parseModelJson } from './json';

export interface JsonAsk {
  /** The parsed document. */
  value: unknown;
  /** The reply it came from, for usage and cost. */
  result: ModelResult;
  /** True when brackets had to be closed — the reply was cut off. */
  repaired: boolean;
  truncated: boolean;
  /** Notes worth passing on: a second attempt, a repaired reply. */
  warnings: string[];
}

const STRICT = 'Return one JSON object and nothing else. No explanation, no markdown fences, '
  + 'no commentary before or after it. Begin your reply with { and end it with }.';

/** What the model said, short enough to put in a warning. */
function excerpt(text: string, limit = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** Why this reply had no JSON in it, in a sentence an operator can act on. */
export function describeReply(result: ModelResult): string {
  const bits: string[] = [];
  if (result.refusal) bits.push(`the model refused: “${excerpt(result.refusal)}”`);
  else if (!result.text.trim()) {
    bits.push(result.reasoningChars
      ? `the model returned no answer at all — it spent ${result.reasoningChars.toLocaleString()} characters on reasoning and stopped`
      : 'the model returned an empty reply');
  } else bits.push(`the model answered with prose, beginning “${excerpt(result.text)}”`);

  if (result.finishReason === 'length') {
    bits.push('and it stopped because it ran out of output budget — raise "Longest reply" in AI settings, or pick a model with more room');
  } else if (result.finishReason && result.finishReason !== 'stop' && result.finishReason !== 'end_turn') {
    bits.push(`(it stopped with "${result.finishReason}")`);
  }
  return bits.join(' ');
}

/**
 * One JSON call, with the second ask built in. Throws only when both attempts
 * failed, and then with a message that says what came back.
 */
export async function askJson(
  call: ModelCall,
  ctx: CallContext,
  config: AiConfig,
): Promise<JsonAsk> {
  const warnings: string[] = [];
  const first = await callModel({ ...call, json: true }, ctx, config);
  try {
    const json = parseModelJson(first.text);
    if (json.truncated) {
      warnings.push(
        'The model ran out of room and the reply was cut off; what it did write has been kept. '
        + 'Check the last questions of the paper.',
      );
    }
    return { value: json.value, result: first, repaired: json.repaired, truncated: json.truncated, warnings };
  } catch (err) {
    const firstProblem = `${describeReply(first)} (${(err as Error).message})`;

    const second = await callModel(
      {
        ...call,
        json: true,
        noJsonMode: true,
        system: call.system ? `${call.system} ${STRICT}` : STRICT,
        prompt: `${call.prompt}\n\n${STRICT}`,
      },
      { ...ctx, meta: { ...ctx.meta, attempt: 2 } },
      config,
    );
    try {
      const json = parseModelJson(second.text);
      warnings.push(
        `The first reply could not be read — ${firstProblem}. Asking again in plain words worked, `
        + 'so the paper below came from the second attempt.',
      );
      if (json.truncated) warnings.push('That second reply was also cut off; the last questions may be missing.');
      return { value: json.value, result: second, repaired: json.repaired, truncated: json.truncated, warnings };
    } catch (again) {
      throw new Error(
        `the model would not return JSON. First attempt: ${firstProblem}. `
        + `Second attempt, asked in plain words: ${describeReply(second)} (${(again as Error).message})`,
      );
    }
  }
}
