/**
 * Provider-agnostic LLM adapter for exam parsing.
 *
 * All three providers are called over plain fetch so the app has no vendor SDK
 * dependency; switching is one env var. If no key is configured the caller
 * falls back to the rule-based parser alone.
 */

import { ExamContent } from '@/types/exam';

export type ProviderName = 'anthropic' | 'openai' | 'google' | 'none';

export interface AiCallResult {
  content: ExamContent;
  provider: ProviderName;
  model: string;
  usage?: Record<string, unknown>;
}

export function configuredProvider(): ProviderName {
  const explicit = (process.env.AI_PROVIDER ?? '').toLowerCase() as ProviderName;
  if (explicit === 'none') return 'none';
  if (explicit === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (explicit === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (explicit === 'google' && process.env.GOOGLE_API_KEY) return 'google';
  // Auto-detect whichever key is present.
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';
  return 'none';
}

const SCHEMA_DOC = `
{
  "title": string,
  "module": "reading" | "listening" | "writing",
  "variant": "academic" | "general",
  "durationMinutes": number,
  "parts": [{
    "title": string,                 // "Part 1"
    "section": string | null,        // "SECTION B: LEXICO-GRAMMAR"
    "instructions": string,          // "Read the text and answer questions 1-13."
    "passage": { "title": string, "html": string } | null,
    "groups": [{
      "type": QuestionType,
      "heading": string,             // "Questions 1-6"
      "instructions": string,        // the rubric, plain text or simple HTML
      "bank": [{ "label": "A"|"i", "text": string }] | null,
      "bodyHtml": string | null,     // gap tasks: text with [[n]] markers
      "fieldColumns": [string] | null, // error-correction table headings
      "questions": [{
        "number": number,
        "prompt": string,
        "options": [{ "label": "A", "text": string }] | null,
        "answers": [string],         // accepted answers; [] if unknown
        "fields": [{ "key": string, "label": string, "answers": [string] }] | null,
        "rootWord": string | null,   // word-formation: the word printed in CAPITALS
        "keyWord": string | null,    // sentence-transformation: the compulsory word
        "selectCount": number | null,
        "minWords": number | null,
        "maxWords": number | null,
        "points": number | null
      }]
    }]
  }]
}`;

const TYPES = [
  'true-false-notgiven', 'yes-no-notgiven', 'multiple-choice', 'multiple-choice-multi',
  'matching-headings', 'matching-information', 'matching-features', 'matching-sentence-endings',
  'multiple-matching', 'summary-completion-bank', 'gapped-text',
  'sentence-completion', 'summary-completion', 'note-completion', 'table-completion',
  'flowchart-completion', 'form-completion', 'short-answer', 'open-cloze', 'word-formation',
  'multiple-choice-cloze', 'error-correction', 'sentence-transformation',
  'diagram-labelling', 'writing-task',
].join(', ');

export function buildPrompt(text: string, hint: { scaffold?: string; module?: string } = {}): string {
  return `You are an exam-digitisation engine. Convert the raw text of an exam paper into structured JSON.

The paper may be IELTS (Academic or General), a Cambridge exam, a national/provincial gifted-student
paper (đề thi học sinh giỏi), a school mock, or any similar reading/listening/writing test. Do not
assume IELTS conventions if the paper does not use them.

TARGET SCHEMA (return exactly this shape, no extra keys):
${SCHEMA_DOC}

QuestionType must be one of: ${TYPES}

RULES
1. Preserve the original wording of passages, rubrics and questions verbatim. Never invent content,
   never summarise, never translate.
2. Number every question with the number printed on the paper. Numbering runs across the whole paper.
3. Put reading passages in parts[].passage.html as <p> paragraphs. If paragraphs are lettered
   (A, B, C...), keep the letter as <p data-ref="A"> and drop it from the visible text.
4. For gap-fill tasks (summary/note/table/flow-chart/form completion) reproduce the block of text in
   groups[].bodyHtml and mark each gap as [[n]] using the printed question number. Leave
   questions[].prompt empty for those; the gap lives in bodyHtml.
5. For sentence-completion and short-answer written as a numbered list, keep one question per item and
   put the gap in prompt as [[n]] (or leave the underscores if the gap is at the end).
6. Matching tasks: put the shared option list in groups[].bank. Roman numerals for headings, capital
   letters otherwise.
7. Answer keys: if the document contains a key, put the accepted answers in questions[].answers.
   Use "|" inside a single string only when the paper itself offers alternatives, e.g. "colour|color".
   If an answer is unknown, use an empty array — never guess.
8. Keep tables as HTML <table> inside bodyHtml when the task is table completion.
9. Type-specific rules for the paper conventions used in Vietnamese specialised-English
   exams (đề chuyên Anh, đề học sinh giỏi) and Cambridge papers:
   - "multiple-choice-cloze": the passage goes in groups[].bodyHtml with [[n]] at each blank;
     each question carries its own four options in questions[].options.
   - "open-cloze": same, but no options — the candidate types one word.
   - "word-formation": one question per line. Put the sentence in prompt with [[n]] where the
     gap is, and the printed capitalised root in rootWord (never inside prompt).
   - "error-correction": one question per mistake. Give each question two fields:
     {key:"mistake"} holding the wrong word(s) and {key:"correction"} holding the right form.
     Put the numbered passage in groups[].bodyHtml. Set fieldColumns to the table headings.
   - "sentence-transformation": prompt is the original sentence, keyWord is the compulsory word
     printed in capitals, answers are the accepted rewrites, and minWords/maxWords carry any
     stated length limit ("between 3 and 7 words" → 3 and 7).
   - "gapped-text": the passage goes in bodyHtml with [[n]] at each removed sentence, and the
     removed sentences go in groups[].bank as A, B, C…
   - "multiple-matching": the shared list goes in bank; one question per speaker or extract.
10. If the paper states points per section or per question, set questions[].points accordingly;
   otherwise leave it null and every question is worth one mark.
11. A paper that mixes listening, lexico-grammar, reading and writing has module "mixed".
   Use parts[].section for the printed section name ("SECTION B: LEXICO-GRAMMAR") and
   parts[].title for the part inside it ("Part 2").
12. Output ONLY the JSON object. No markdown fences, no commentary.
${hint.module ? `\nThe operator says this paper is a ${hint.module} paper.` : ''}
${hint.scaffold ? `\nA rule-based pre-pass produced this rough outline. Use it as a hint about part and
question boundaries, but trust the raw text where they disagree:\n${hint.scaffold}` : ''}

RAW TEXT OF THE PAPER
---
${text}
---`;
}

/* ------------------------------ providers ------------------------------ */

async function callAnthropic(prompt: string): Promise<{ raw: string; model: string; usage?: any }> {
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      temperature: 0,
      system: 'You return only valid JSON. No prose, no markdown fences.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const raw = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return { raw, model, usage: data.usage };
}

async function callOpenAI(prompt: string): Promise<{ raw: string; model: string; usage?: any }> {
  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You return only valid JSON. No prose, no markdown fences.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return { raw: data.choices?.[0]?.message?.content ?? '', model, usage: data.usage };
}

async function callGoogle(prompt: string): Promise<{ raw: string; model: string; usage?: any }> {
  const model = process.env.GOOGLE_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 16000 },
    }),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const raw = (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  return { raw, model, usage: data.usageMetadata };
}

/* ------------------------------- driver -------------------------------- */

export function extractJson(raw: string): any {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error('Model did not return JSON.');
  return JSON.parse(s.slice(first, last + 1));
}

export const MAX_CHARS = 160_000;

export async function callModel(prompt: string, provider: ProviderName) {
  switch (provider) {
    case 'anthropic': return callAnthropic(prompt);
    case 'openai': return callOpenAI(prompt);
    case 'google': return callGoogle(prompt);
    default: throw new Error('No AI provider configured.');
  }
}
