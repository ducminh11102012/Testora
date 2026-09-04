/**
 * Rule-based structural parser.
 *
 * Two very different layouts have to come out of the same code:
 *
 *   IELTS / Cambridge          Vietnamese specialised-English (đề chuyên Anh)
 *   ─────────────────          ────────────────────────────────────────────
 *   READING PASSAGE 1          SECTION A – READING (45 POINTS)
 *   <passage>                  Part 1. (10 points). Read the passage and …
 *   Questions 1–6              <passage>
 *   <rubric>                   1. <stem>A. opt B. opt C. opt D. opt
 *   1  <statement>             2. …
 *   …                          Your answers:
 *   ANSWER KEY                 <empty grid>
 *
 * The first has explicit "Questions n–m" headers; the second numbers straight
 * from the rubric, runs the options together on one line, and ends with a blank
 * answer grid that must not be mistaken for content.
 */

import { uid } from '../utils';
import {
  BankOption, ChoiceOption, ExamContent, Group, Part, Question, QuestionType,
} from '@/types/exam';

export interface RuleParseResult {
  content: ExamContent;
  answerKey: Record<number, string[]>;
  warnings: string[];
  confidence: number; // 0..1
}

/* ------------------------------- patterns ------------------------------ */

const RE_SECTION = /^SECTION\s+([A-Z0-9]{1,3})\s*[-–—:.]?\s*(.*)$/i;
const RE_PART = /^(?:READING\s+PASSAGE|PASSAGE|PART|Part|SECTION|TASK|Task)\s*([0-9]{1,2}|[IVX]{1,4})\s*[.:)]?\s*(?:\(([^)]{0,40})\))?\s*[.:]?\s*(.*)$/;
const RE_QRANGE = /^questions?\s*(\d{1,3})\s*(?:[-–—]|to)\s*(\d{1,3})/i;
const RE_QSINGLE = /^question\s*(\d{1,3})\b/i;
const RE_NUM_ITEM = /^(\d{1,3})\s*[.)]\s*(.+)$/;
const RE_NUM_LOOSE = /^(\d{1,3})\s{1,4}(\S.*)$/;
const RE_OPTION_LINE = /^([A-H])\s*[.)]\s*(.+)$/;
const RE_ROMAN_LINE = /^(x?(?:ix|iv|v?i{1,3}|v|x))\s*[.)]?\s+(.{3,})$/i;
const RE_ANSWER_SHEET = /^(your\s+answers?|answer\s+sheet|đáp\s*án\s*(của\s*)?(bạn|em)?)\s*[:.]?\s*$/i;
/*
 * The line a printed key starts with. Papers rarely stop at the bare words —
 * "ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM", "ANSWER KEY — TEST 3" — so a few trailing words
 * are allowed, but only on a short line, or a sentence that merely mentions the
 * answers would swallow the rest of the paper.
 */
const RE_ANSWERKEY = /^(?:answer\s*key|answers?|key|đáp\s*án|hướng\s*dẫn\s*chấm)\b[^\n]{0,44}$/i;
const RE_WORDLIMIT = /no\s+more\s+than\s+(one|two|three|four|five|\d+)\s+word/i;
const RE_BETWEEN_WORDS = /between\s+(\d+)\s+and\s+(\d+)\s+words/i;
const RE_ERROR_COUNT = /(?:contains?|find(?:\s+and\s+correct)?|identify)\s+(?:exactly\s+)?(\d+|ten|five|eight|twelve)\s+(?:mistakes|errors)/i;
const RE_POINTS = /(\d+)\s*(?:points?|marks?|điểm)/i;

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, eight: 8, ten: 10, twelve: 12,
};

const GAP_TYPES = new Set<QuestionType>([
  'sentence-completion', 'summary-completion', 'note-completion', 'table-completion',
  'flowchart-completion', 'form-completion', 'short-answer', 'open-cloze', 'word-formation',
]);

const lines = (text: string) => text.split('\n').map((l) => l.trim());

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------ classifier ----------------------------- */

export function detectType(rubric: string, sample: string[] = []): QuestionType {
  const r = `${rubric} ${sample.join(' ')}`.toLowerCase();

  // Conventions specific to Vietnamese specialised-English papers come first:
  // several of their rubrics also contain phrases the IELTS patterns match.
  if (RE_ERROR_COUNT.test(r) || /identify\s+and\s+correct|find\s+and\s+correct/.test(r)) return 'error-correction';
  if (/use the word given in (capitals|brackets)|word given in capitals|form a word that/.test(r)) return 'word-formation';
  if (/think of the word which best fits|only one word in each (space|blank)|fill one suitable word|fill in each blank with one word|one word (for|into) each (blank|gap|space)/.test(r))
    return 'open-cloze';
  if (/(best|correct) (word|phrase|answer|option)[^.]{0,60}(for each|to indicate)[^.]{0,30}(numbered\s*)?(blank|gap|space)/.test(r))
    return 'multiple-choice-cloze';
  if (/sentences? (have|has) been removed|choose the correct sentence from the list|list of missing sentences/.test(r))
    return 'gapped-text';
  if (/new sentence as similar as possible|complete the second sentence so that it has (a )?similar meaning|rewrite the sentences? so that|using the word given\.? do not change/.test(r))
    return 'sentence-transformation';
  if (/you will hear five short extracts|match each speaker|choose from the list [a-h]/.test(r)) return 'multiple-matching';
  if (/match each paragraph with its function|match(ing)? (the )?(paragraph|section)s? with/.test(r)) return 'matching-features';

  // IELTS / Cambridge conventions.
  if (/not\s*given/.test(r) && /\byes\b/.test(r) && /\bno\b/.test(r)) return 'yes-no-notgiven';
  if (/not\s*given/.test(r)) return 'true-false-notgiven';
  if (/list\s+of\s+headings|correct\s+heading|choose\s+the\s+heading/.test(r)) return 'matching-headings';
  if (/which\s+(paragraph|section)\s+contains|matching\s+information/.test(r)) return 'matching-information';
  if (/list\s+of\s+(people|researchers|scientists|places|companies)/.test(r)) return 'matching-features';
  if (/sentence\s+endings|correct\s+ending/.test(r)) return 'matching-sentence-endings';
  if (/choose\s+(two|three|2|3)\s+letters/.test(r)) return 'multiple-choice-multi';
  if (/complete\s+the\s+(summary|notes)\s+below[^.]*box|list\s+of\s+words/.test(r)) return 'summary-completion-bank';
  if (/complete\s+the\s+summary/.test(r)) return 'summary-completion';
  if (/complete\s+the\s+table/.test(r)) return 'table-completion';
  if (/complete\s+the\s+(flow[- ]?chart|diagram)/.test(r)) return 'flowchart-completion';
  if (/label\s+the\s+diagram/.test(r)) return 'diagram-labelling';
  if (/complete\s+the\s+form/.test(r)) return 'form-completion';
  if (/complete\s+the\s+notes/.test(r)) return 'note-completion';
  if (/complete\s+the\s+sentences/.test(r)) return 'sentence-completion';
  if (/write\s+an?\s+(essay|letter|report|email|article)|write\s+at\s+least\s+\d+\s+words|you\s+should\s+write\s+at\s+least|choose\s+one\s+of\s+the\s+following\s+options/.test(r))
    return 'writing-task';
  if (/answer\s+the\s+questions?\s+below|write\s+no\s+more\s+than/.test(r)) return 'short-answer';
  if (/choose\s+the\s+(correct|best)\s+(letter|answer|word|option)|indicate\s+the\s+correct|circle\s+the\s+correct|best\s+completes\s+each\s+sentence/.test(r))
    return 'multiple-choice';

  if (sample.some((s) => RE_OPTION_LINE.test(s)) || sample.some(hasInlineOptions)) return 'multiple-choice';
  return 'sentence-completion';
}

/* ------------------------------- helpers ------------------------------- */

/** True when a single line carries "A. … B. … C. …" run together. */
/**
 * Word regularly loses the line break before an option, gluing the label to the
 * previous word — "…plastic usage?A. The incompatibility…expansionB. The…". A
 * word-boundary test misses exactly that case, so labels are found positionally
 * instead: A, B and C must appear in order, each followed by a stop or bracket
 * and then text.
 */
const LABEL_RUN = /([A-H])[.)](?=\s*[^\s])/g;

function labelMarks(text: string): { label: string; at: number; len: number }[] {
  const letters = 'ABCDEFGH';
  const marks: { label: string; at: number; len: number }[] = [];
  let want = 0;
  for (const m of text.matchAll(LABEL_RUN)) {
    if (m[1] !== letters[want]) continue;
    const at = m.index ?? 0;
    // The label has to start a new option, not sit inside a word like "IELTS A1".
    marks.push({ label: m[1], at, len: m[0].length });
    want += 1;
    if (want >= letters.length) break;
  }
  return marks;
}

function hasInlineOptions(line: string): boolean {
  return labelMarks(line).length >= 3;
}

/**
 * Splits "stem?A. one B. two C. three D. four" into its parts. Word processors
 * routinely lose the line breaks between options, so this is the difference
 * between reading a paper and failing on it.
 */
export function splitInlineOptions(text: string): { stem: string; options: ChoiceOption[] } {
  const marks = labelMarks(text);
  if (marks.length < 3) return { stem: text.trim(), options: [] };

  const stem = text.slice(0, marks[0].at).trim();
  // No stem means the line is the option list itself, not a question. That is
  // a real layout — the stem on one line, "A. … B. … C. … D. …" on the next —
  // but it is not this function's job: see optionRun below, which the block
  // reader calls for exactly that line.
  if (!stem) return { stem: text.trim(), options: [] };

  const options = cutAt(text, marks);
  // An "option" with nothing in it means the labels were something else.
  if (options.some((o) => !o.text)) return { stem: text.trim(), options: [] };
  return { stem, options };
}

function cutAt(text: string, marks: ReturnType<typeof labelMarks>): ChoiceOption[] {
  return marks.map((mark, i) => ({
    label: mark.label,
    text: text.slice(mark.at + mark.len, i + 1 < marks.length ? marks[i + 1].at : undefined)
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/**
 * A whole line that is nothing but the options: "A. review  B. reviews  C.
 * reviewed  D. reviewing", printed under the stem. It is the commonest
 * multiple-choice layout there is outside IELTS, and it used to be read as one
 * option — label A, with B, C and D inside its text — because the line does
 * start with "A." and the one-option-per-line rule got there first.
 */
export function optionRun(text: string): ChoiceOption[] {
  const marks = labelMarks(text);
  if (marks.length < 3 || marks[0].at > 2) return [];
  const options = cutAt(text, marks);
  return options.some((o) => !o.text) ? [] : options;
}

/** `(3) ______` and `3. ______` inside a passage become positioned gaps. */
function markNumberedGaps(text: string): string {
  return text
    .replace(/\((\d{1,3})\)\s*_{2,}/g, (_m, n) => `[[${n}]]`)
    .replace(/\((\d{1,3})\)\s*\.{4,}/g, (_m, n) => `[[${n}]]`)
    .replace(/\b(\d{1,3})\s*_{3,}/g, (_m, n) => `[[${n}]]`);
}

/** Underscore runs with no number take the next number in the range. */
export function templateGaps(text: string, lo: number, hi: number): string {
  let n = lo;
  const marked = markNumberedGaps(escapeHtml(text));
  const filled = marked.replace(/(_{2,}|\.{4,}|…+)/g, () => (n <= hi ? `[[${n++}]]` : '____'));
  return filled.split('\n').filter(Boolean).map((l) => `<p>${l}</p>`).join('\n');
}

function toParagraphs(block: string[]): string {
  const out: string[] = [];
  for (const raw of block) {
    if (!raw) continue;
    const ref = raw.match(/^([A-H])\s{2,}(\S.*)$/);
    out.push(ref ? `<p data-ref="${ref[1]}">${escapeHtml(ref[2])}</p>` : `<p>${escapeHtml(raw)}</p>`);
  }
  return out.join('\n');
}

function wordLimit(rubric: string): number | undefined {
  const m = rubric.match(RE_WORDLIMIT);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  return WORD_NUM[v] ?? Number(v) ?? undefined;
}

function romanBank(block: string[]): BankOption[] {
  const bank: BankOption[] = [];
  for (const l of block) {
    const m = l.match(RE_ROMAN_LINE);
    if (m && m[2] && m[2].length > 3) bank.push({ label: m[1].toLowerCase(), text: m[2].trim() });
  }
  return bank;
}

function letterBank(block: string[]): BankOption[] {
  const bank: BankOption[] = [];
  for (const l of block) {
    const m = l.match(RE_OPTION_LINE);
    if (m && m[2] && m[2].length > 2) bank.push({ label: m[1].toUpperCase(), text: m[2].trim() });
  }
  return bank;
}

/**
 * Said when the paper itself prints no answers. A key that arrives separately —
 * its own file, or the back of the book — is applied later, and then this note
 * is taken back out rather than left to contradict it.
 */
export const NO_KEY_NOTE =
  'No printed answer key was found — answers will need to be filled in before the paper can be marked.';

/* ---------------------------- answer key pass -------------------------- */

/**
 * Keys are printed in sequence ("1 ii  2 iv  3 iii"), sometimes several to a
 * line and sometimes one per line. Rather than guessing where each answer ends,
 * walk forward looking for the next expected question number and take
 * everything between the two. That copes with multi-word answers and with
 * answers that are themselves numbers.
 */
export function parseAnswerKey(
  text: string,
  opts: { whole?: boolean } = {},
): Record<number, string[]> {
  const key: Record<number, string[]> = {};
  const all = lines(text);

  let start = -1;
  for (let i = all.length - 1; i >= 0; i--) if (RE_ANSWERKEY.test(all[i])) { start = i + 1; break; }
  /*
   * A key that arrived as its own file has nothing to find: the whole document
   * is the key. Papers are published that way constantly — the paper for the
   * candidates, the key for the teacher — and insisting on a heading meant a
   * perfectly plain list of answers was read as nothing at all.
   */
  if (start < 0) {
    if (!opts.whole) return key;
    start = 0;
  }

  const region = all.slice(start).join('\n');
  const positionOf = (n: number, from: number): number => {
    const re = new RegExp(`(?:^|[\\s\\n])${n}\\s*[.):\\-]?\\s`, 'g');
    re.lastIndex = from;
    const m = re.exec(region);
    return m ? m.index + m[0].length : -1;
  };

  const first = region.match(/(?:^|[\s\n])(\d{1,3})\s*[.):\-]?\s/);
  let n = first ? Number(first[1]) : 1;
  let cursor = 0;

  for (let guard = 0; guard < 400; guard++) {
    const at = positionOf(n, cursor);
    if (at < 0) break;
    const next = positionOf(n + 1, at);
    const raw = (next > at
      ? region.slice(at, next).replace(/(?:^|[\s\n])\d{1,3}\s*[.):\-]?\s*$/, '')
      : region.slice(at)).trim();

    const value = raw.split('\n')[0].trim().replace(/\s{2,}.*$/, '').replace(/[,;]+$/, '');
    if (value) key[n] = [/^not\s*given$/i.test(value) ? 'NOT GIVEN' : value];
    if (next < 0) break;
    cursor = at;
    n += 1;
  }
  return key;
}

/**
 * The marking instructions printed with a key: what each criterion is worth,
 * how spelling is treated, what earns full marks. A Vietnamese key carries this
 * under "HƯỚNG DẪN CHẤM", and it is the rubric the school actually marks by, so
 * it is worth keeping even without a model to read it.
 */
const RE_MARKING_HEADING = /^[^\n]{0,22}?(?:hướng\s*dẫn\s*chấm|thang\s*điểm|biểu\s*điểm|marking\s*(?:scheme|guide|guidelines|instructions|criteria)|assessment\s*criteria)\b[^\n]{0,44}$/i;

export function parseMarkingNotes(text: string): string | undefined {
  const all = lines(text);
  const at = all.findIndex((line) => RE_MARKING_HEADING.test(line));
  if (at < 0) return undefined;
  const body = all.slice(at + 1)
    // Stop at the next heading that is plainly a different section.
    .filter((line) => !RE_ANSWERKEY.test(line))
    .join('\n')
    .trim();
  if (body.length < 20) return undefined;
  return `${all[at].trim()}\n${body}`.slice(0, 4000);
}

/** Removes the blank grid a candidate would write into on paper. */
function stripAnswerSheets(all: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < all.length; i++) {
    if (!RE_ANSWER_SHEET.test(all[i])) { out.push(all[i]); continue; }
    let j = i + 1;
    // Skip the run of bare numbers / short cells that follows.
    while (j < all.length && (all[j] === '' || /^[\d\s.|]{0,6}$/.test(all[j]))) j++;
    i = j - 1;
  }
  return out;
}

/* ------------------------------- main pass ----------------------------- */

interface RawPart {
  section?: string;
  title: string;
  rubric: string[];
  points?: number;
  lines: string[];
}

export function parseWithRules(
  text: string,
  opts: { module?: 'reading' | 'listening' | 'writing' | 'mixed'; title?: string } = {},
): RuleParseResult {
  const warnings: string[] = [];
  const answerKey = parseAnswerKey(text);

  let all = lines(text);
  let end = all.length;
  for (let i = all.length - 1; i >= 0; i--) if (RE_ANSWERKEY.test(all[i])) { end = i; break; }
  all = stripAnswerSheets(all.slice(0, end));

  /* --- 1. split into sections and parts --------------------------------- */

  const parts: RawPart[] = [];
  let section: string | undefined;
  let current: RawPart | null = null;

  for (const line of all) {
    const sec = line.match(RE_SECTION);
    if (sec && line.length < 90) {
      section = line.replace(/\s+/g, ' ').trim();
      current = null;
      continue;
    }

    const pm = line.match(RE_PART);
    if (pm && line.length < 260) {
      const points = pm[2]?.match(RE_POINTS);
      current = {
        section,
        title: `Part ${pm[1]}`,
        rubric: pm[3] ? [pm[3].trim()] : [],
        points: points ? Number(points[1]) : undefined,
        lines: [],
      };
      parts.push(current);
      continue;
    }

    if (!current) { current = { section, title: 'Part 1', rubric: [], lines: [] }; parts.push(current); }
    current.lines.push(line);
  }
  if (!parts.length) parts.push({ title: 'Part 1', rubric: [], lines: all });

  /* --- 2. build each part ------------------------------------------------ */

  const outParts: Part[] = [];

  parts.forEach((rp, partIdx) => {
    // Instruction lines that continue the rubric sit before any content and are
    // short, imperative sentences.
    let cursor = 0;
    while (
      cursor < rp.lines.length &&
      (rp.lines[cursor] === '' ||
        (rp.lines[cursor].length < 200 &&
          /^(write|choose|read|use|complete|identify|find|listen|match|fill|do not|you (will|should|have)|there|for questions|note:)/i
            .test(rp.lines[cursor])))
    ) {
      if (rp.lines[cursor]) rp.rubric.push(rp.lines[cursor]);
      cursor++;
    }
    const body = rp.lines.slice(cursor);
    const rubric = rp.rubric.join(' ');

    // Explicit "Questions n–m" headers split a part into several tasks.
    const headers: { at: number; lo: number; hi: number }[] = [];
    body.forEach((line, i) => {
      const mr = line.match(RE_QRANGE);
      const ms = line.match(RE_QSINGLE);
      if (mr) headers.push({ at: i, lo: Number(mr[1]), hi: Number(mr[2]) });
      else if (ms) headers.push({ at: i, lo: Number(ms[1]), hi: Number(ms[1]) });
    });

    const groups: Group[] = [];
    let passage: string | undefined;
    let passageTitle: string | undefined;

    if (headers.length) {
      passage = toParagraphs(body.slice(0, headers[0].at)) || undefined;
      headers.forEach((h, i) => {
        const to = i + 1 < headers.length ? headers[i + 1].at : body.length;
        const block = body.slice(h.at + 1, to);
        groups.push(buildGroup({
          block, rubric, extra: [], lo: h.lo, hi: h.hi, answerKey, warnings,
          heading: h.lo === h.hi ? `Question ${h.lo}` : `Questions ${h.lo}–${h.hi}`,
        }));
      });
    } else {
      // No header: the whole part is one task. Everything before the first
      // numbered item is the passage or the cloze body.
      const firstItem = body.findIndex((l) => RE_NUM_ITEM.test(l) || RE_NUM_LOOSE.test(l));
      const head = firstItem > 0 ? body.slice(0, firstItem) : (firstItem === 0 ? [] : body);
      const items = firstItem >= 0 ? body.slice(firstItem) : [];

      const type = detectType(rubric, items.slice(0, 8));
      const headText = head.filter(Boolean);

      // A short leading line in title case is the passage's title.
      if (headText.length && headText[0].length < 90 && !/[.]$/.test(headText[0])) {
        passageTitle = headText.shift();
      }

      const group = buildGroup({
        block: items, rubric, extra: headText, lo: 0, hi: 0, answerKey, warnings,
        heading: undefined, forcedType: type,
      });

      // Where the leading text belongs depends on the task.
      if (type === 'multiple-choice-cloze' || type === 'open-cloze' || type === 'error-correction'
        || type === 'gapped-text' || GAP_TYPES.has(type)) {
        const nums = group.questions.map((q) => q.number);
        const lo = nums.length ? Math.min(...nums) : 1;
        const hi = nums.length ? Math.max(...nums) : 1;
        group.bodyHtml = templateGaps(headText.join('\n'), lo, hi);
      } else if (headText.length) {
        passage = toParagraphs(headText);
      }

      if (group.questions.length || group.bodyHtml) {
        const nums = group.questions.map((x) => x.number);
        if (nums.length) {
          const min = Math.min(...nums);
          const max = Math.max(...nums);
          group.heading = min === max ? `Question ${min}` : `Questions ${min}–${max}`;
        }
        groups.push(group);
      }
    }

    // A repeated running header in a PDF can look like a part. One that ends up
    // with neither questions nor a passage is folded into the part before it.
    if (!groups.length && !passage) {
      const previous = outParts[outParts.length - 1];
      if (previous && rp.rubric.length) {
        previous.instructions = `${previous.instructions} ${rp.rubric.join(' ')}`.trim();
      }
      return;
    }

    outParts.push({
      id: uid('part'),
      title: rp.title,
      section: rp.section,
      points: rp.points,
      instructions: rp.rubric[0] ?? '',
      passage: passage ? { title: passageTitle, html: passage } : undefined,
      groups,
    });
  });

  /* --- 3. confidence and warnings ---------------------------------------- */

  // Number the parts within each printed section, so "Part 2" always means the
  // second part of the section it sits in.
  const seenPerSection = new Map<string, number>();
  for (const part of outParts) {
    const key = part.section ?? '';
    const next = (seenPerSection.get(key) ?? 0) + 1;
    seenPerSection.set(key, next);
    part.title = `Part ${next}`;
  }

  const totalQ = outParts.reduce((s, p) => s + p.groups.reduce((t, g) => t + g.questions.length, 0), 0);
  const keyed = outParts.reduce((s, p) => s + p.groups.reduce(
    (t, g) => t + g.questions.filter((q) => q.answers.length || q.fields?.some((f) => f.answers.length)).length, 0), 0);

  if (!totalQ) warnings.push('No questions were recognised. Try the AI pass, or check that the file is text and not a scan.');
  else if (!keyed) warnings.push(NO_KEY_NOTE);

  const confidence = totalQ === 0 ? 0
    : Math.min(1, 0.35 + 0.4 * (keyed / totalQ) + (outParts.length > 1 ? 0.15 : 0) + (totalQ > 20 ? 0.1 : 0));

  const module = opts.module ?? (outParts.some((p) => /listening/i.test(p.section ?? '')) ? 'mixed' : 'reading');

  return {
    content: {
      title: opts.title ?? 'Imported paper',
      module,
      variant: 'school',
      durationMinutes: module === 'listening' ? 30 : 90,
      parts: outParts,
    },
    answerKey,
    warnings,
    confidence,
  };
}

/* ------------------------------ group build ---------------------------- */

function buildGroup(input: {
  block: string[];
  rubric: string;
  extra: string[];
  lo: number;
  hi: number;
  answerKey: Record<number, string[]>;
  warnings: string[];
  heading?: string;
  forcedType?: QuestionType;
}): Group {
  const { block, rubric, extra, lo, hi, answerKey, heading } = input;
  const type = input.forcedType ?? detectType(rubric, block.slice(0, 8));
  const limit = wordLimit(rubric);
  const range = rubric.match(RE_BETWEEN_WORDS);

  const group: Group = {
    id: uid('grp'),
    type,
    heading,
    instructions: rubric ? escapeHtml(rubric) : undefined,
    questions: [],
  };

  if (type === 'matching-headings') {
    const bank = romanBank([...extra, ...block]);
    if (bank.length) group.bank = bank;
  } else if (['matching-information', 'matching-features', 'matching-sentence-endings',
    'summary-completion-bank', 'gapped-text', 'multiple-matching'].includes(type)) {
    const bank = letterBank([...extra, ...block]);
    if (bank.length) group.bank = bank;
  }

  /* --- error correction: the item count comes from the rubric ------------ */
  if (type === 'error-correction') {
    const m = rubric.match(RE_ERROR_COUNT);
    const count = m ? (WORD_NUM[m[1].toLowerCase()] ?? Number(m[1])) : 10;
    group.fieldColumns = ['No.', 'Mistake', 'Correction'];
    for (let i = 1; i <= count; i++) {
      group.questions.push({
        id: uid('q'),
        number: (lo || 1) + i - 1,
        answers: [],
        fields: [
          { key: 'mistake', label: 'Mistake', answers: [], width: 200 },
          { key: 'correction', label: 'Correction', answers: answerKey[(lo || 1) + i - 1] ?? [], width: 200 },
        ],
        points: 1,
      });
    }
    return group;
  }

  /* --- numbered items ---------------------------------------------------- */
  let q: Question | null = null;
  const flush = () => { if (q) { group.questions.push(q); q = null; } };

  for (const line of block) {
    if (!line) continue;

    const numbered = line.match(RE_NUM_ITEM) ?? line.match(RE_NUM_LOOSE);
    if (numbered) {
      const n = Number(numbered[1]);
      if (n > 0 && n <= 200 && (!hi || (n >= lo && n <= hi))) {
        flush();
        const { stem, options } = splitInlineOptions(numbered[2]);
        q = {
          id: uid('q'),
          number: n,
          prompt: stem,
          answers: answerKey[n] ?? [],
          maxWords: limit,
          points: 1,
        };
        if (options.length) {
          q.options = options;
          // The options were printed on one line, so print them on one line.
          if (!group.optionLayout) group.optionLayout = 'row';
        } else if (type === 'multiple-choice' || type === 'multiple-choice-multi' || type === 'multiple-choice-cloze') {
          q.options = [];
        }
        if (range) { q.minWords = Number(range[1]); q.maxWords = Number(range[2]); }
        continue;
      }
    }

    const option = line.match(RE_OPTION_LINE);
    if (option && q && q.options) {
      /*
       * "A. review   B. reviews   C. reviewed   D. reviewing" on one line is
       * four options, not one option whose text happens to mention B, C and D.
       * It starts with "A." so the single-option rule matched it first and
       * swallowed the other three — which is how a page of multiple choice
       * became a page of questions with one option each, and then, once the
       * lone option was dropped, a paper of short answers.
       */
      {
        const options = optionRun(line);
        if (options.length >= 3) {
          q.options.push(...options);
          if (!group.optionLayout) group.optionLayout = 'row';
          continue;
        }
      }
      q.options.push({ label: option[1].toUpperCase(), text: option[2].trim() });
      if (!group.optionLayout) group.optionLayout = 'stack';
      continue;
    }

    if (q && hasInlineOptions(line) && q.options && q.options.length === 0) {
      const { options } = splitInlineOptions(line);
      if (options.length) {
        q.options.push(...options);
        if (!group.optionLayout) group.optionLayout = 'row';
        continue;
      }
    }

    if (q && line.length > 1 && !RE_OPTION_LINE.test(line)) q.prompt = `${q.prompt ?? ''} ${line}`.trim();
  }
  flush();

  /* --- per-type shaping -------------------------------------------------- */

  if (type === 'sentence-transformation') {
    for (const item of group.questions) {
      const m = (item.prompt ?? '').match(/\b([A-Z]{3,})\b\s*$/);
      if (m) {
        item.keyWord = m[1];
        item.prompt = (item.prompt ?? '').replace(/\s*\b[A-Z]{3,}\b\s*$/, '').trim();
      }
      item.minWords ??= range ? Number(range[1]) : 3;
      item.maxWords ??= range ? Number(range[2]) : 8;
    }
  }

  if (type === 'word-formation') {
    for (const item of group.questions) {
      const m = (item.prompt ?? '').match(/\(([A-Z]{3,})\)\s*$/) ?? (item.prompt ?? '').match(/\b([A-Z]{3,})\b\s*$/);
      if (m) {
        item.rootWord = m[1];
        item.prompt = (item.prompt ?? '').replace(/\s*\(?\b[A-Z]{3,}\b\)?\s*$/, '').trim();
      }
    }
  }

  if (GAP_TYPES.has(type) || type === 'sentence-transformation') {
    for (const item of group.questions) {
      if (item.prompt && /(_{2,}|\.{4,}|…+)/.test(item.prompt)) {
        item.prompt = item.prompt.replace(/(_{2,}|\.{4,}|…+)/, `[[${item.number}]]`).replace(/(_{2,}|\.{4,}|…+)/g, '');
      }
    }
  }

  if (type === 'writing-task' && !group.questions.length) {
    group.questions.push({
      id: uid('q'), number: lo || 1, answers: [],
      minWords: Number(rubric.match(/at least\s+(\d{2,4})\s+words/i)?.[1] ?? 250),
      points: 1,
    });
    if (extra.length) group.instructions = `${group.instructions ?? ''}<br/>${escapeHtml(extra.join(' '))}`;
  }

  return group;
}
