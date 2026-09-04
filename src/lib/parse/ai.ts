/**
 * The prompt that turns a raw exam paper into structured JSON.
 *
 * The provider call itself lives in src/lib/ai/provider.ts, which is shared
 * with the marking engine so every model call is priced and metered in one
 * place.
 */

import { ProviderName, isConfigured, loadAiConfig } from '../ai/config';

export type { ProviderName };

/** Which provider is live, taking the console's settings into account. */
export async function configuredProvider(): Promise<ProviderName> {
  const cfg = await loadAiConfig('parse');
  return isConfigured(cfg) ? cfg.provider : 'none';
}

const SCHEMA_DOC = `
{
  "title": string,
  "module": "reading" | "listening" | "writing",
  "scoring": "band" | "points",
  "totalPoints": number | null,
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

export function buildPrompt(
  text: string,
  hint: {
    scaffold?: string;
    module?: string;
    chunk?: { index: number; total: number };
    /**
     * The printed answers for this paper, read before the paper itself. A model
     * with the key in front of it copies; a model without one guesses, and a
     * guessed key marks a whole class wrong.
     */
    key?: string;
  } = {},
): string {
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
   ${hint.key ? 'The PRINTED ANSWER KEY for this paper is given below, already read. Copy those '
    + 'answers into questions[].answers exactly, matching by question number. Do not solve the '
    + 'questions yourself, do not "correct" the key, and do not leave a number empty that the key '
    + 'gives an answer for.' : ''}
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
10. MARKS. This is not always an IELTS paper, and most papers are not scored on the IELTS band
   scale at all. Read what the paper itself says and set "scoring":
   - "band" ONLY for a real IELTS paper (it says IELTS, or it is plainly an Academic/General
     Training Listening, Reading or Writing paper with the usual 40 questions).
   - "points" for everything else — a Vietnamese gifted-student paper (đề thi học sinh giỏi), a
     specialised-school entrance paper (đề chuyên / đề tuyển sinh), a school mock, a Cambridge
     practice paper, an in-house progress test. These are marked out of the total printed on the
     paper, never as a band.
   Set "totalPoints" to that printed total when the paper states one — "Tổng điểm: 20",
   "(20,0 điểm)", "Total: 100 marks", the mark shown against the title. Use null if it says nothing.
   Then distribute the marks so they add up:
   - Where a question shows its own mark, use it: questions[].points.
   - Where only a section total is printed ("SECTION B: LEXICO-GRAMMAR (30 points)", "Phần II (4,0
     điểm)"), put that total in parts[].points and divide it evenly across that section's questions
     in questions[].points — a 4,0-điểm section of 8 questions is 0.5 a question. Round to two
     decimals; if it does not divide evenly, give the remainder to the first questions.
   - Where the paper says nothing at all, leave points null: every question is then worth one mark
     and the total is the number of questions.
   - An essay or letter carries the mark printed against it (often several points); do not give a
     writing task the same mark as a one-word gap.
11. A paper that mixes listening, lexico-grammar, reading and writing has module "mixed".
   Use parts[].section for the printed section name ("SECTION B: LEXICO-GRAMMAR") and
   parts[].title for the part inside it ("Part 2").
12. Formatting inside a question matters: papers underline the word being tested, and bold or
   italicise parts of a rubric. Keep those as inline HTML — <u>, <b>, <i>, <sup>, <sub> — inside
   prompt, instructions, option text and bodyHtml. Use nothing else, and never wrap a whole field
   in a tag for decoration.
13. When the printed paper puts the options across one line (A. one  B. two  C. three  D. four),
   set groups[].optionLayout to "row". When each option is on its own line, use "stack". Leave it
   out if you cannot tell.
14. Output ONLY the JSON object. No markdown fences, no commentary.
${hint.chunk ? `
THIS IS PIECE ${hint.chunk.index} OF ${hint.chunk.total} OF ONE PAPER.
Convert only what is printed below. Do not invent the missing pieces, do not repeat a part you cannot
see, and keep the question numbers exactly as printed — the pieces are joined back together
afterwards, so numbering must not restart.` : ''}
${hint.module ? `\nThe operator says this paper is a ${hint.module} paper.` : ''}
${hint.scaffold ? `\nA rule-based pre-pass produced this rough outline. Use it as a hint about part and
question boundaries, but trust the raw text where they disagree:\n${hint.scaffold}` : ''}

${hint.key ? `\nPRINTED ANSWER KEY FOR THIS PAPER (authoritative — copy it):\n---\n${hint.key}\n---` : ''}

RAW TEXT OF THE PAPER
---
${text}
---`;
}

export const MAX_CHARS = 160_000;

/**
 * How much of a paper to put in one call. A long paper's JSON is longer than
 * its text, so a whole 40-question section can overrun any output limit — the
 * pipeline sends the paper in pieces of this size when one call is not enough.
 */
export const CHUNK_CHARS = 22_000;

/**
 * Splits a paper on the boundaries it prints — sections, parts, question ranges
 * — so a chunk never starts in the middle of a task. Falls back to blank lines,
 * and then to a hard cut, because some PDFs have no structure at all.
 */
export function splitForModel(text: string, size = CHUNK_CHARS): string[] {
  if (text.length <= size) return [text];

  const BOUNDARY = /^(?=\s*(?:SECTION|PART|Section|Part|PHẦN|Phần)\b|\s*Questions?\s+\d)/m;
  const blocks = text.split(BOUNDARY).filter((b) => b.trim().length);
  const chunks: string[] = [];
  let current = '';

  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };

  for (const block of blocks) {
    if (block.length > size) {
      // One enormous block: break it on blank lines instead.
      push();
      let piece = '';
      for (const para of block.split(/\n{2,}/)) {
        if (piece.length + para.length + 2 > size) { if (piece.trim()) chunks.push(piece.trim()); piece = ''; }
        piece += (piece ? '\n\n' : '') + para;
      }
      if (piece.trim()) chunks.push(piece.trim());
      continue;
    }
    if (current.length + block.length > size) push();
    current += block;
  }
  push();
  return chunks.length ? chunks : [text.slice(0, size)];
}

/**
 * Writing a paper rather than reading one.
 *
 * The schema is the same, because the paper has to end up in the same shape as
 * an imported one — the exam screen, the marker and the report know nothing
 * about where a paper came from. What changes is the instruction: invent the
 * material, and print an answer for every question, because there is no
 * printed key to fall back on.
 */
export function buildComposePrompt(req: {
  instructions: string;
  sample?: string;
  module?: string;
  questions?: number;
  minutes?: number;
  scoring?: 'band' | 'points';
  totalPoints?: number;
}): string {
  return `You are an examiner writing a new exam paper. Produce the paper as structured JSON.

WHAT IS WANTED
${req.instructions.trim()}

TARGET SCHEMA (return exactly this shape, no extra keys):
${SCHEMA_DOC}

QuestionType must be one of: ${TYPES}

RULES
1. Write the whole paper: passages, rubrics, questions and options, in full. Nothing may be a
   placeholder, an ellipsis or an instruction to the reader to supply something later.
2. Every question must have its answer in questions[].answers. You are writing the key as well as
   the paper, and a question with no answer cannot be marked.
3. Keep to real exam conventions: numbered questions running across the paper, a rubric above each
   group, a word limit where the task needs one.
4. Reading passages go in parts[].passage.html as <p> paragraphs, and must be original prose you
   write yourself — never a passage copied from a published book or website.
5. Gap tasks put the block in groups[].bodyHtml with [[n]] at each gap; matching tasks put the
   shared list in groups[].bank.
6. Formatting inside a question uses only <u>, <b>, <i>, <sup>, <sub>.
7. Options printed across one line get groups[].optionLayout "row"; one per line gets "stack".
${req.questions ? `8. Write ${req.questions} questions in total, numbered from 1.` : '8. Choose a sensible number of questions for the task.'}
${req.minutes ? `9. The paper is sat in ${req.minutes} minutes: put that in durationMinutes.` : '9. Put a realistic time allowance in durationMinutes, or 0 for no limit.'}
10. MARKS. ${req.scoring === 'band'
    ? 'This is an IELTS-style paper: set "scoring" to "band".'
    : req.scoring === 'points'
      ? `This paper is marked in points: set "scoring" to "points"${req.totalPoints ? ` out of a total of ${req.totalPoints}` : ''}, put the total in "totalPoints", and divide the marks across the questions so they add up exactly.`
      : 'Set "scoring" to "band" only for a genuine IELTS paper; otherwise use "points", put the total in "totalPoints" and divide the marks so they add up.'}
11. Output ONLY the JSON object. No markdown fences, no commentary.
${req.module ? `\nThe paper is a ${req.module} paper.` : ''}
${req.sample ? `\nHere is a paper of the kind that is wanted. Follow its shape, its task types and its
level of difficulty — but write new material, do not copy it:\n---\n${req.sample.slice(0, 40_000)}\n---` : ''}`;
}

/**
 * The same job, from pictures. A photographed or scanned paper has no text
 * layer, so the model is shown the pages themselves and asked for the same
 * JSON — reading the page as it looks, including what is underlined.
 */
export function buildVisionPrompt(hint: { pages: number; module?: string; note?: string } = { pages: 1 }): string {
  return `You are an exam-digitisation engine reading ${hint.pages} page image(s) of an exam paper —
a photograph or a scan. Transcribe what you can see and convert it into structured JSON.

TARGET SCHEMA (return exactly this shape, no extra keys):
${SCHEMA_DOC}

QuestionType must be one of: ${TYPES}

RULES
1. Transcribe verbatim. Never invent a question, an option or a passage, and never translate.
   Where the scan is genuinely unreadable, leave the field empty rather than guessing.
2. Read the pages in order; they are consecutive pages of one paper.
3. Keep the printed question numbers. Numbering runs across the whole paper.
4. Keep underlining, bold and italics as inline <u>, <b>, <i> in prompt, instructions, option text
   and bodyHtml — in these papers the underlined word is usually the one being tested.
5. Options printed across one line get groups[].optionLayout "row"; one per line gets "stack".
6. Gap tasks: reproduce the block in groups[].bodyHtml with [[n]] at each blank, using the printed
   number. Tables stay as <table> inside bodyHtml.
7. Matching tasks: the shared list goes in groups[].bank.
8. An answer key printed on the page goes into questions[].answers. If there is none, leave the
   arrays empty — never guess an answer.
9. A part answered while a recording plays is a listening part: set parts[].listening to true.
10. MARKS. Most papers are not IELTS and are not scored in bands. Set "scoring" to "band" only for
   a real IELTS paper, and "points" for a Vietnamese gifted-student or specialised-school paper, a
   school mock or any other paper marked out of a printed total. Put that printed total in
   "totalPoints" when you can see one, put a section's total in parts[].points, and divide a
   section's marks evenly across its questions in questions[].points so that everything adds up.
11. If the paper states a time allowance, put it in durationMinutes; if it does not, use 0.
12. Output ONLY the JSON object. No markdown fences, no commentary.
${hint.module ? `\nThe operator says this paper is a ${hint.module} paper.` : ''}
${hint.note ? `\n${hint.note}` : ''}`;
}
