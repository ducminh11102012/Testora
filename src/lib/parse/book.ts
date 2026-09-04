/**
 * A book is not a paper.
 *
 * Centres do not upload one exam at a time; they upload the book — twenty
 * practice tests, a reading set, a writing set, and the answer key at the back.
 * Sending all of that to a model in one call fails for two reasons at once: the
 * reply is far longer than any model will write, and the result is one
 * unusable paper with four hundred questions in it.
 *
 * So the text is cut into its papers first, on the headings the book itself
 * prints, and each paper is read on its own. The answer key at the back is cut
 * up the same way and given back to the test it belongs to.
 */

export interface BookSegment {
  /** "Test 4", "ĐỀ SỐ 12" — what the book calls it. */
  title: string;
  text: string;
  /** 1-based position in the book. */
  index: number;
  /** The number printed in the heading, which is how a separate answer-key
   * file is matched to this paper. */
  number: number;
  /** Which rule found this cut, so the operator can be told what happened. */
  by: CutBy;
  /**
   * This paper's share of the answers printed at the back of the book, when
   * they could be matched to it. Read as if the key had been uploaded as its
   * own file, which is the same thing arriving a different way.
   */
  keyText?: string;
}

/**
 * How a book was cut up.
 *
 *   test      the book prints "Test 4" / "ĐỀ SỐ 12" — whole papers
 *   exercise  it prints "Part 5" / "Exercise 12" / "Bài 3" forty times over —
 *             a drill book, where one exercise is one paper
 *   restart   it prints no headings at all, but the question numbers go back to
 *             1 every so often, which is the same boundary said differently
 *   chunk     none of the above, and the operator said it is a book anyway
 */
export type CutBy = 'test' | 'exercise' | 'restart' | 'chunk';

export type Grain = 'auto' | 'test' | 'exercise' | 'chunk';

export interface SegmentOptions {
  /**
   * The operator ticked "this is a whole book". One paper is then a *failure*,
   * not an answer, so the ladder is walked all the way down to blind chunking
   * rather than handing back four hundred questions in a single paper.
   */
  force?: boolean;
  /** Cut on whole tests, on exercises, or work it out (the default). */
  grain?: Grain;
}

/** A paper shorter than this is a fragment — a contents line, a cover page. */
const MIN_PAPER_CHARS = 1_500;

/**
 * An exercise is not a paper and must not be measured against one. Thirty
 * incomplete sentences fit in a page and a half; the old floor of 1,500
 * characters swallowed every one of them back into the piece before it, which
 * is precisely how a drill book ended up as one paper.
 */
const MIN_EXERCISE_CHARS = 320;

/** Blind chunking aims for this much text per paper. */
const CHUNK_CHARS = 6_000;

/**
 * The headings books use to start a new paper. Each alternative must capture
 * the number in group 1 so the sequence can be checked.
 */
const HEADINGS: RegExp[] = [
  // English: TEST 1 / PRACTICE TEST 1 / MODEL TEST 1 / READING TEST 1 / EXAM 1
  /^[ \t]*(?:(?:practice|model|mock|sample|reading|listening|writing|full|complete)\s+)?tests?\s*(?:no\.?|number)?\s*(\d{1,2})\b[^\n]{0,60}$/gim,
  /^[ \t]*exam(?:ination)?\s*(?:no\.?)?\s*(\d{1,2})\b[^\n]{0,60}$/gim,
  // Vietnamese: ĐỀ SỐ 3 / ĐỀ THI SỐ 3 / ĐỀ 3 / ĐỀ THI THỬ SỐ 3
  /^[ \t]*[đd][eề](?:\s*thi)?(?:\s*th[uử])?(?:\s*s[oố])?\s*(\d{1,2})\b[^\n]{0,60}$/gim,
];

/** Where the printed answers begin. */
const KEY_HEADING = new RegExp(
  '^[ \\t]*(?:'
  + 'answer\\s*keys?|answers?|keys?|keys?\\s+to\\s+[^\\n]{0,40}|answer\\s*sheet|'
  + 'solutions?|'
  // Vietnamese: ĐÁP ÁN · ĐÁP ÁN CHI TIẾT · BẢNG ĐÁP ÁN · ĐÁP ÁN THAM KHẢO · KEY
  + 'b[aả]ng\\s*[đd][aá]p\\s*[aá]n|[đd][aá]p\\s*[aá]n[^\\n]{0,30}|'
  + 'h[uư][oớ]ng\\s*d[aẫ]n\\s*gi[aả]i[^\\n]{0,30}'
  + ')[ \\t:.\\-]*$',
  'gim',
);

interface Mark { at: number; title: string; number: number; family: string }

/**
 * The headings a drill book prints instead of "Test 1": the same word over and
 * over, sometimes with the same number after it. Group 1 is the number, group 2
 * — via the keyword itself — is the family, which is what stops four "PART"
 * lines inside one IELTS listening paper being read as four papers.
 */
const EXERCISE_HEADINGS: RegExp[] = [
  /^[ \t]*(part|passage|exercise|practice|task|section|unit|lesson|drill|activity|quiz|set)\s*(?:no\.?|number)?\s*(\d{1,3})\s*[.:)\u2013\u2014-]?[^\n]{0,80}$/gim,
  /^[ \t]*(b[àa]i(?:\s*(?:t[âậ]p|[đd][oọ]c|nghe|vi[eế]t|n[oó]i))?|ph[âầ]n|ch[uủ]\s*[đd][eề]|luy[eệ]n\s*t[âậ]p)\s*(?:s[oố]\s*)?(\d{1,3})\s*[.:)\u2013\u2014-]?[^\n]{0,80}$/gim,
];

function marksIn(text: string): Mark[] {
  const found: Mark[] = [];
  for (const pattern of HEADINGS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const number = Number(m[1]);
      if (!Number.isFinite(number) || number < 1 || number > 99) continue;
      found.push({ at: m.index, title: m[0].trim().replace(/\s+/g, ' '), number, family: 'test' });
    }
  }
  found.sort((a, b) => a.at - b.at);
  // Two patterns can match the same line; keep the first at each position.
  return found.filter((mark, i) => i === 0 || mark.at - found[i - 1].at > 4);
}

/**
 * A contents page lists every test in the book within a few hundred characters.
 * Those headings are not papers, so a run of headings packed far more tightly
 * than the rest is dropped.
 */
function dropContentsPage(marks: Mark[], length: number): Mark[] {
  if (marks.length < 4) return marks;
  const kept = marks.filter((mark, i) => {
    const next = marks[i + 1];
    if (!next) return true;
    // A heading followed by another within 600 characters, in the first tenth
    // of the book, is a line in the table of contents.
    return !(next.at - mark.at < 600 && mark.at < length * 0.1);
  });
  return kept.length >= 2 ? kept : marks;
}

/** Cuts the answer key at the back into one block per test. */
function splitKey(keyText: string): Map<number, string> {
  const out = new Map<number, string>();
  const marks = marksIn(keyText);
  for (const [i, mark] of marks.entries()) {
    const end = marks[i + 1]?.at ?? keyText.length;
    out.set(mark.number, keyText.slice(mark.at, end));
  }
  return out;
}

/* ------------------------------------------------------ the other cuts ---- */

function exerciseMarks(text: string): Mark[] {
  const found: Mark[] = [];
  for (const pattern of EXERCISE_HEADINGS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const number = Number(m[2]);
      if (!Number.isFinite(number) || number < 1 || number > 200) continue;
      found.push({
        at: m.index,
        title: m[0].trim().replace(/\s+/g, ' ').slice(0, 80),
        number,
        family: m[1].toLowerCase().replace(/\s+/g, ' '),
      });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return found.filter((mark, i) => i === 0 || mark.at - found[i - 1].at > 4);
}

/**
 * Words that name a *piece of one paper* — an IELTS listening paper has four
 * parts, a TOEIC test has seven, a reading paper has three passages — against
 * words that name a *standalone drill*, which is what a workbook is made of.
 *
 * The distinction is the whole game. "Part 1 … Part 7" once through is one
 * paper; "Part 5" printed twelve times is twelve papers; "Bài 1 … Bài 8" is
 * eight papers whether or not anything repeats.
 */
const SUBDIVISION = /^(part|section|passage|task|ph[âầ]n)$/;

/**
 * Which run of headings — if any — is a book of exercises rather than the parts
 * of one paper.
 *
 * A subdivision word only starts new papers when it repeats (the same drill
 * again) or when there are more of them than any single paper has parts. A
 * standalone word needs no such excuse: three exercises are three exercises.
 */
function exerciseRun(text: string, force = false): Mark[] {
  const byFamily = new Map<string, Mark[]>();
  for (const mark of exerciseMarks(text)) {
    const list = byFamily.get(mark.family) ?? [];
    list.push(mark);
    byFamily.set(mark.family, list);
  }
  /*
   * Every family that qualifies is used, not just the biggest one. A real
   * workbook is mixed — thirty "Part 5" drills, then three "Bài đọc" passages,
   * then two writing tasks — and taking only the longest run left the reading
   * glued to the last grammar drill, which is the same bug as not splitting at
   * all, only harder to see.
   */
  const kept: Mark[] = [];
  for (const [family, marks] of byFamily) {
    const numbers = marks.map((m) => m.number);
    const repeats = new Set(numbers).size < numbers.length;
    const enough = force
      ? marks.length >= 2
      : SUBDIVISION.test(family)
        ? marks.length >= 4 && (repeats || marks.length >= 8)
        : marks.length >= 3;
    if (enough) kept.push(...marks);
  }
  kept.sort((a, b) => a.at - b.at);
  // Two families can name the same line ("Bài tập 3" matches twice); one cut.
  return kept.filter((mark, i) => i === 0 || mark.at - kept[i - 1].at > 4);
}

/**
 * No headings at all, so the questions themselves say where one exercise ends:
 * numbering that has climbed to 20 and then starts again at 1 has started
 * something new. Only a real drop counts — a page number, a year, a line
 * beginning "1985" is not a question 1985.
 */
function restartMarks(text: string): Mark[] {
  const line = /^[ \t]*(\d{1,3})[.)]\s+\S/gm;
  const found: Array<{ at: number; n: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = line.exec(text))) found.push({ at: m.index, n: Number(m[1]) });
  if (found.length < 8) return [];

  const marks: Mark[] = [];
  let ordinal = 0;
  for (const [i, item] of found.entries()) {
    const previous = found[i - 1];
    const restarted = previous && item.n <= 2 && previous.n >= 5;
    if (i === 0 || restarted) {
      ordinal += 1;
      marks.push({ at: item.at, title: `Exercise ${ordinal}`, number: ordinal, family: 'restart' });
    }
  }
  return marks.length >= 3 ? marks : [];
}

/**
 * Last resort, and only when the operator has said this is a book: cut it into
 * pieces of roughly one paper's length on blank lines, so nothing is cut
 * through the middle of a question. A rough cut that can be tidied beats one
 * paper with four hundred questions in it, which cannot.
 */
function chunkMarks(text: string): Mark[] {
  if (text.length < CHUNK_CHARS * 1.5) return [];
  // Blank lines first, then any line break, then the end of a sentence. A PDF
  // that came out as one long paragraph has none of the first and plenty of the
  // last, and it is still better cut somewhere than not cut at all.
  const breaks = [/\n[ \t]*\n/g, /\n/g, /[.!?\u2026]\s+/g]
    .map((re) => [...text.matchAll(re)].map((m) => m.index ?? 0))
    .find((list) => list.length >= 2) ?? [];
  if (breaks.length < 2) return [];
  const marks: Mark[] = [{ at: 0, title: 'Part 1', number: 1, family: 'chunk' }];
  let last = 0;
  for (const at of breaks) {
    if (at - last < CHUNK_CHARS) continue;
    marks.push({ at, title: `Part ${marks.length + 1}`, number: marks.length + 1, family: 'chunk' });
    last = at;
  }
  return marks.length >= 2 ? marks : [];
}

/* --------------------------------------------------- the key at the back -- */

/**
 * The answers printed at the back of the book.
 *
 * Attaching them used to work only for books cut on "Test 1" headings, because
 * that was the only way the key was cut too. A workbook of "Part 5" drills with
 * a perfectly good key on the last four pages therefore got *no* key at all —
 * and the model was then asked to work the answers out from scratch, which is
 * how a paper whose answers were printed in the book came back with invented
 * ones. Every cut gets its key now, by whichever of these fits:
 *
 *   1. the key repeats the body's headings — cut it the same way, pair in order
 *   2. the key is one run of numbers per exercise, starting again each time —
 *      pair the runs with the papers in order
 *   3. the numbering runs straight through the book — give each paper the
 *      numbers it actually asks
 *
 * and if none of them fits, the key is left off and the operator is told, which
 * is the one outcome worse than no key: answers filed against the wrong paper.
 */
/**
 * Where the answers at the back begin.
 *
 * A heading is the easy case, and there are more spellings of it than the first
 * version allowed for — `ANSWER KEY`, `KEYS`, `ANSWERS`, `ĐÁP ÁN`, `BẢNG ĐÁP
 * ÁN`, `HƯỚNG DẪN GIẢI`. Plenty of books print no heading at all and simply end
 * with four pages of `1. C  2. B  3. D`, so that shape is recognised too: a
 * tail of short lines, dense with numbered one-or-two-word answers, and without
 * the option runs (`A. … B. …`) that a real exercise has.
 */
export function findKeyRegion(text: string): number {
  KEY_HEADING.lastIndex = 0;
  let heading = -1;
  let m: RegExpExecArray | null;
  while ((m = KEY_HEADING.exec(text))) {
    // Past the first fifth: a contents page or a rubric mentioning "answers"
    // near the front is not the key.
    if (m.index > text.length * 0.2) { heading = m.index; break; }
  }
  if (heading >= 0) return heading;

  // No heading. Walk back through the blank-line blocks while they look like a
  // grid of answers rather than like questions.
  const blocks: Array<{ at: number; text: string }> = [];
  const re = /\n[ \t]*\n/g;
  let from = 0;
  let cut: RegExpExecArray | null;
  while ((cut = re.exec(text))) {
    blocks.push({ at: from, text: text.slice(from, cut.index) });
    from = cut.index + cut[0].length;
  }
  blocks.push({ at: from, text: text.slice(from) });

  const looksLikeGrid = (block: string): boolean => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    if (lines.some((l) => /(?:^|\s)[A-D]\s*[.)]\s+\S.{6,}/.test(l) && l.length > 70)) return false;
    const numbered = lines.filter((l) => /^\d{1,3}\s*[.):\-]/.test(l)).length;
    const average = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
    return numbered >= Math.max(2, lines.length * 0.6) && average < 70;
  };

  let start = blocks.length;
  while (start > 0 && looksLikeGrid(blocks[start - 1].text)) start -= 1;
  if (start >= blocks.length) return -1;

  const at = blocks[start].at;
  // Only the tail, and only if there is enough of it to be a key.
  if (at < text.length * 0.5) return -1;
  return keyEntries(text.slice(at)).length >= 15 ? at : -1;
}

interface KeyEntry { number: number; text: string }

/**
 * The answers in the order they are printed: `1. C  2. B  3. D`, one per line
 * or twenty to a line, restarting at 1 as often as the book likes.
 *
 * Order matters more than the numbers do. A workbook numbers every exercise
 * from 1 while printing its key straight through 1…600 (or the reverse), so
 * matching on the number alone throws the key away — which is what "there is an
 * answer key at the back and it says there is no answer key" was.
 */
export function keyEntries(text: string): KeyEntry[] {
  const marks: Array<{ at: number; end: number; number: number }> = [];
  const re = /(?:^|[\s;,|)])(\d{1,3})\s*[.):\-]\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const number = Number(m[1]);
    if (number >= 1 && number <= 999) marks.push({ at: m.index + m[0].length, end: 0, number });
  }
  for (const [i, mark] of marks.entries()) mark.end = marks[i + 1]?.at ?? text.length;

  const entries: KeyEntry[] = [];
  for (const mark of marks) {
    // An answer is short: a letter, a word, a few words, a true/false. Anything
    // longer is prose that happens to start with a number.
    const answer = text.slice(mark.at, mark.end)
      .split('\n')[0]
      .replace(/\s+/g, ' ')
      .replace(/[\s,;.]+$/, '')
      .replace(/\s*\d{1,3}\s*$/, '')
      .trim();
    if (!answer || answer.length > 60) continue;
    entries.push({ number: mark.number, text: answer });
  }
  return entries;
}

/** The question numbers a paper asks, in the order it asks them. */
function questionNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /^[ \t]*(\d{1,3})\s*[.)]\s+\S/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 200 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** A key block written the way a paper prints one, so the parser reads it. */
function asKeyText(numbers: number[], answers: KeyEntry[]): string {
  return numbers
    .map((number, i) => (answers[i] ? `${number}. ${answers[i].text}` : null))
    .filter(Boolean)
    .join('\n');
}

/**
 * Gives each paper its share of the answers printed at the back. Returns how
 * many papers got one, so the caller can say what happened rather than leaving
 * it to be discovered by a candidate who was marked wrong.
 *
 * Three ways, tried in order:
 *
 *   1. **The key repeats the body's headings** — cut it the same way, pair up.
 *   2. **The numbers line up** — every paper's numbers appear in the key, so
 *      each paper takes its own.
 *   3. **By position** — the papers are numbered 1…13 each and the key runs
 *      1…600, or the other way about. The k-th paper takes the next k answers
 *      and they are renumbered onto its questions. Only done when the totals
 *      agree closely, because drift here would file answers under the wrong
 *      questions, which is worse than no key at all.
 */
/**
 * The key cut into its runs: 1…13, then 1…13 again, and so on. A workbook
 * prints its key exactly like that — one block per exercise — and pairing those
 * blocks with the papers is far more forgiving than counting everything and
 * hoping the totals agree.
 */
function runsOf(entries: KeyEntry[]): KeyEntry[][] {
  const runs: KeyEntry[][] = [];
  let current: KeyEntry[] = [];
  let previous = 0;
  for (const entry of entries) {
    const carriesOn = current.length && (entry.number === previous + 1 || entry.number === previous);
    if (!carriesOn) {
      if (current.length) runs.push(current);
      current = [];
    }
    current.push(entry);
    previous = entry.number;
  }
  if (current.length) runs.push(current);
  return runs;
}

export function shareOutKey(
  segments: BookSegment[],
  keyText: string,
  by: CutBy,
  opts: {
    /**
     * The operator said where the key is — its own file, or a page number. Then
     * "this is not the key" is not on the table, and the totals are allowed to
     * disagree by more before the match is given up.
     */
    trusted?: boolean;
  } = {},
): number {
  if (!segments.length || !keyText.trim()) return 0;
  const give = (segment: BookSegment, block: string) => {
    const trimmed = block.trim();
    if (trimmed) segment.keyText = trimmed;
  };

  // 1. The key prints the same headings the body does.
  const marks = by === 'test' ? marksIn(keyText) : exerciseRun(keyText, true);
  if (marks.length === segments.length && marks.length >= 2) {
    for (const [i, mark] of marks.entries()) {
      give(segments[i], keyText.slice(mark.at, marks[i + 1]?.at ?? keyText.length));
    }
    return segments.length;
  }

  const entries = keyEntries(keyText);
  if (entries.length < 2) return 0;

  const asked = segments.map((segment) => questionNumbers(segment.text));
  const total = asked.reduce((sum, list) => sum + list.length, 0);
  if (!total) return 0;

  /*
   * 2. The numbers themselves line up — but only if they can. A book whose
   * exercises each start again at 1 has forty questions called "1", and giving
   * every one of them the answer printed against 1 at the back is not a key,
   * it is forty wrong answers. So matching by number is allowed only when no
   * number is asked twice in the whole book.
   */
  const seenNumbers = new Set<number>();
  let numbersRestart = false;
  for (const numbers of asked) {
    for (const n of numbers) {
      if (seenNumbers.has(n)) { numbersRestart = true; break; }
      seenNumbers.add(n);
    }
    if (numbersRestart) break;
  }

  const byNumber = new Map<number, KeyEntry[]>();
  for (const entry of entries) {
    const list = byNumber.get(entry.number) ?? [];
    list.push(entry);
    byNumber.set(entry.number, list);
  }
  const everyNumberOnce = [...byNumber.values()].every((list) => list.length === 1);
  const covered = asked.every((numbers) => numbers.filter((n) => byNumber.has(n)).length >= numbers.length * 0.8);
  if (!numbersRestart && everyNumberOnce && covered) {
    let given = 0;
    for (const [i, segment] of segments.entries()) {
      const block = asked[i]
        .map((n) => (byNumber.get(n) ? `${n}. ${byNumber.get(n)![0].text}` : null))
        .filter(Boolean)
        .join('\n');
      if (block) { give(segment, block); given += 1; }
    }
    return given;
  }

  /*
   * 3. Run by run. The key is printed as one block per exercise, each starting
   * again at 1 — so the blocks are paired with the papers by *shape*: the next
   * run whose length matches this paper's question count. That copes with a key
   * that has a run the body does not (an exercise we merged, a stray table)
   * without dragging every later paper out of step.
   */
  const runs = runsOf(entries);
  if (runs.length > 1) {
    let cursor = 0;
    let matched = 0;
    const chosen: Array<KeyEntry[] | null> = [];
    for (const numbers of asked) {
      let found: KeyEntry[] | null = null;
      // Look a little way ahead: a run the body does not have is skipped rather
      // than shifting everything after it.
      for (let at = cursor; at < Math.min(runs.length, cursor + 3); at += 1) {
        if (Math.abs(runs[at].length - numbers.length) <= 2) {
          found = runs[at];
          cursor = at + 1;
          matched += 1;
          break;
        }
      }
      chosen.push(found);
    }
    if (matched >= Math.max(2, segments.length * 0.6)) {
      let given = 0;
      for (const [i, segment] of segments.entries()) {
        const run = chosen[i];
        if (!run) continue;
        const block = asKeyText(asked[i], run);
        if (block) { give(segment, block); given += 1; }
      }
      if (given) return given;
    }
  }

  /*
   * 4. Straight along. The totals have to agree, near enough: a key with half
   * as many answers as the book has questions is a key for something else, or
   * one we read badly, and pairing it up by position would file answer 1 of
   * exercise 7 against question 1 of exercise 4. An operator who has told us
   * where the key is gets more rope than a guess does.
   */
  const slack = Math.max(3, Math.round(total * (opts.trusted ? 0.35 : 0.12)));
  if (Math.abs(entries.length - total) > slack) return 0;

  let cursor = 0;
  let given = 0;
  for (const [i, segment] of segments.entries()) {
    const numbers = asked[i];
    if (!numbers.length) continue;
    const slice = entries.slice(cursor, cursor + numbers.length);
    cursor += numbers.length;
    if (slice.length < numbers.length * 0.6) continue;
    const block = asKeyText(numbers, slice);
    if (block) { give(segment, block); given += 1; }
  }
  return given;
}

/* ------------------------------------------------------------- assembly --- */

function build(body: string, marks: Mark[], by: CutBy): BookSegment[] {
  const floor = by === 'test' ? MIN_PAPER_CHARS : MIN_EXERCISE_CHARS;
  const segments: BookSegment[] = [];
  const seenTitles = new Map<string, number>();

  for (const [i, mark] of marks.entries()) {
    const end = marks[i + 1]?.at ?? body.length;
    let piece = body.slice(mark.at, end).trim();
    if (piece.length < floor) {
      // Too short to be a paper: it belongs to the one before it.
      if (segments.length) segments[segments.length - 1].text += `\n\n${piece}`;
      continue;
    }
    // A drill book prints "Part 5" forty times. Forty papers called Part 5
    // cannot be told apart in a list, so the repeat is numbered.
    const base = mark.title || `Paper ${segments.length + 1}`;
    const seen = (seenTitles.get(base) ?? 0) + 1;
    seenTitles.set(base, seen);
    const title = seen > 1 ? `${base} (${seen})` : base;

    segments.push({
      title,
      text: piece,
      index: segments.length + 1,
      number: by === 'test' ? mark.number : segments.length + 1,
      by,
    });
  }
  return segments;
}

/**
 * Splits a book into its papers. A document that is only one paper comes back
 * as a single segment, so the caller can treat both the same way.
 *
 * Four rules, tried in order, because a book says what it is in four different
 * ways: printed test headings, printed exercise headings, question numbering
 * that starts over, and — only when the operator has ticked "this is a book" —
 * length. The first rule that yields more than one paper wins.
 */
export function segmentBook(text: string, opts: SegmentOptions = {}): BookSegment[] {
  const whole: BookSegment[] = [{ title: '', text, index: 1, number: 1, by: 'test' }];
  // Short enough that nothing inside it could be two papers. The floor is the
  // *exercise* one, not the paper one: eight grammar drills fit in 2,600
  // characters, and measuring them against a full test's length was one of the
  // two reasons a drill book came back as a single paper.
  if (text.length < MIN_EXERCISE_CHARS * 2 && !opts.force) return whole;

  // The answer key at the back belongs to the papers, not to a paper of its own.
  const keyStart = findKeyRegion(text);
  const body = keyStart >= 0 ? text.slice(0, keyStart) : text;
  const backKey = keyStart >= 0 ? text.slice(keyStart) : '';

  const grain = opts.grain ?? 'auto';
  const ladder: Array<[CutBy, () => Mark[]]> = [];
  if (grain === 'auto' || grain === 'test') {
    ladder.push(['test', () => dropContentsPage(marksIn(body), body.length)]);
  }
  if (grain === 'auto' || grain === 'exercise') {
    ladder.push(['exercise', () => exerciseRun(body, opts.force || grain === 'exercise')]);
    ladder.push(['restart', () => restartMarks(body)]);
  }
  // Blind chunking is never chosen on its own: either it was asked for, or
  // every rule above found nothing and the operator insists this is a book.
  if (grain === 'chunk' || opts.force) ladder.push(['chunk', () => chunkMarks(body)]);

  for (const [by, find] of ladder) {
    const marks = find();
    if (marks.length < 2) continue;
    const segments = build(body, marks, by);
    if (segments.length >= 2) {
      if (backKey) shareOutKey(segments, backKey, by);
      return segments;
    }
  }

  // Anything printed before the first heading — a foreword, an introduction —
  // is not a paper and is left out rather than glued onto Test 1.
  return whole;
}

/**
 * Cuts a separate answer-key file into one block per test, keyed by the number
 * printed on its heading. Books publish the key as its own file at least as
 * often as they print it at the back, and a key for twenty tests must reach the
 * right one — question 3 of Test 7 is not question 3 of Test 1.
 */
export function splitAnswerKey(text: string): Map<number, string> {
  return splitKey(text);
}

/** True when the upload is a collection rather than a single paper. */
export function looksLikeBook(text: string): boolean {
  return segmentBook(text).length > 1;
}
