import { ImportMeta, SuiteItem, fingerprintOf, imports, suites, tests } from './db';
import { ImportRow } from '@/types/db';
import { ParseOutcome, ParsedPaper, Strategy, parseCollection } from './parse';
import { Grain } from './parse/book';
import { typeFolder } from './parse/shelve';
import { normaliseContent } from './parse/normalize';
import { splitPaper } from './parse/split';
import { ExamContent, missingAudio, totalQuestions } from '@/types/exam';
import { fillMissingAnswers, countMissingAnswers } from './ai/answers';
import { explainAnswers } from './ai/explain';
import { composePaper } from './ai/compose';
import { loadAiConfig } from './ai/config';
import { purgeImport } from './storage/retention';
import { retentionHoursFor } from './storage/buckets';
import { asHfTarget, bucketById } from './storage/vault';
import { getFile } from './storage/hf';

/**
 * Importing a paper is slow — extraction, a rule pass, a model pass, then an
 * answer key — and nobody should have to sit and watch it. The upload returns as
 * soon as the file is safe, and the work below runs on afterwards, ending with
 * the finished paper in the organisation's bank as a draft.
 */

export interface ImportOptions {
  strategy: Strategy;
  module?: 'reading' | 'listening' | 'writing' | 'mixed';
  title?: string;
  orgId: string;
  userId: string | null;
  /** Set false to leave the answer key alone (the paper came with one). */
  writeMissingAnswers?: boolean;
  publish?: boolean;
  /**
   * Have the model write an explanation for every answer, so a candidate's
   * review screen says why rather than just "Incorrect". Costs another model
   * call per ten questions, so it is asked for rather than assumed.
   */
  explain?: boolean;
  /**
   * Put the papers in the bank, so a full test can be assembled from them at
   * random. A book always is; a single upload is when the operator asks.
   */
  bank?: boolean;
  /** Continue a run that was cut short, skipping this many papers. */
  startAt?: number;
  /** The folder the papers are filed under. A book uses its own title. */
  folder?: string | null;
  /**
   * The text of a separate answer-key file. Papers whose key is published as
   * its own document are the reason this exists; the key often carries the
   * marking rubric too, which ends up on the paper.
   */
  keyText?: string;
  /**
   * "This upload is a whole book — split it." Ticked, one paper is a failure
   * rather than an answer, and the splitter goes all the way down to cutting by
   * length. A book of drills prints no "Test 1" anywhere, and the honest
   * outcome for it is thirty rough papers, not one paper with three hundred
   * questions that nobody can sit.
   */
  book?: boolean;
  /** Cut on whole tests, on exercises, or work it out. */
  grain?: Grain;
  /** The page the printed answers start on, when the operator knows it. */
  keyFromPage?: number;
  /** Read the key with the model before reading the paper. Default on. */
  keyFirst?: boolean;
  /**
   * "Keep this as one paper." The opposite of the book tick, and it means it:
   * the upload is not cut into papers, and its skills are not split apart
   * either. A paper with a listening section, a reading section and a writing
   * task is normally three papers, because that is how a full test is sat —
   * but a centre's own mixed paper is one paper, sat in one go, and cutting it
   * up turns a coherent exam into three loose pieces in the bank.
   */
  keepWhole?: boolean;
  /**
   * The text of the upload from an earlier run, when the original file can no
   * longer be fetched. Set by the sweep, never by the upload.
   */
  pretext?: string;
  /**
   * File each paper under its own type — "Cambridge 18 / Reading — Multiple
   * choice" — rather than dropping a mixed book into one folder.
   */
  fileByType?: boolean;
}

/**
 * How long one run may spend reading. A book is longer than any one serverless
 * invocation is given, so the run stops while it can still record what it did
 * and the sweep carries on from there. A long-running server has no such limit.
 */
/**
 * How much of the extracted text is kept on the import row so a paused book can
 * be continued without the original file. A book runs to a few hundred thousand
 * characters; this is room for a large one and a bounded row either way.
 */
const KEEP_TEXT_CHARS = 1_500_000;

function timeBudget(): number | undefined {
  const stated = Number(process.env.IMPORT_BUDGET_MS ?? '');
  if (Number.isFinite(stated) && stated > 0) return stated;
  /*
   * A budget everywhere now, not only on Vercel. On a server of one's own there
   * is no platform to cut the function off — so a four-hundred-paper book ran
   * as one unbroken job holding everything it had read, and the site went with
   * it. Ninety seconds, then the run records where it got to and comes back for
   * the next slice; the papers already read are already saved.
   */
  return process.env.VERCEL ? 210_000 : 90_000;
}

/**
 * One heavy read at a time in this process.
 *
 * Three uploads at once used to mean three books being cut up, three sets of
 * model calls and three books' worth of text in memory, on the same single
 * thread that serves every page. They queue instead: the wait is invisible
 * (it is all background work), and the site stays up.
 */
let laneEnd: Promise<unknown> = Promise.resolve();
let waiting = 0;

export function importLaneDepth(): number { return waiting; }

function inLane<T>(work: () => Promise<T>): Promise<T> {
  waiting += 1;
  const next = laneEnd.then(work, work).finally(() => { waiting -= 1; });
  // The lane must not break on a failed job: the next one still has to run.
  laneEnd = next.catch(() => undefined);
  return next;
}

/**
 * Where a run got to — kept on the import row, because the run happens in the
 * background and the console has to be able to ask.
 */
export interface Progress {
  /** Papers finished, and how many there are. */
  done: number;
  total: number;
  /** Which paper, in the book's own words. */
  label?: string;
  /** What kind of work is happening now. */
  stage?: ImportStage;
  /** 0–100. Worked out from the stage, so a long read still moves. */
  percent?: number;
  /** Characters the model has written so far in this call. */
  chars?: number;
  /** The end of what the model is writing, for the live view. */
  tail?: string;
  updatedAt?: string;
}

export type ImportStage =
  | 'queued'
  | 'extracting'
  | 'segmenting'
  | 'reading'
  | 'reading-piece'
  | 'answers'
  | 'explaining'
  | 'saving'
  | 'done'
  | 'failed';

/** What each stage is called on screen. */
export const STAGE_LABEL: Record<ImportStage, string> = {
  queued: 'Waiting to start',
  extracting: 'Reading the file',
  segmenting: 'Finding the papers in it',
  reading: 'The model is reading the paper',
  'reading-piece': 'The model is reading it section by section',
  answers: 'Writing the answer key',
  explaining: 'Writing the answer explanations',
  saving: 'Saving',
  done: 'Finished',
  failed: 'Failed',
};

function progressOf(record: ImportMeta): Progress {
  try {
    const parsed = JSON.parse(record.progress || '{}') as Partial<Progress>;
    return {
      done: Number(parsed.done) || 0,
      total: Number(parsed.total) || 0,
      label: parsed.label,
      stage: parsed.stage,
      percent: Number(parsed.percent) || 0,
      chars: Number(parsed.chars) || 0,
      tail: parsed.tail,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { done: 0, total: 0 };
  }
}

/** The last of what the model has written, for the live view. */
const TAIL_CHARS = 1400;

/** How often progress is written. A model streams far faster than this. */
const WRITE_EVERY_MS = 400;

/**
 * Keeps the import row's progress up to date without writing to the database
 * on every token.
 *
 * A streamed reply arrives in hundreds of small pieces a second. Writing each
 * one would turn a read into a write storm, so the state is kept here and
 * flushed on a timer — except a stage change, which is flushed at once because
 * that is the line somebody is watching.
 */
class Reporter {
  private state: Progress = { done: 0, total: 1, percent: 0 };

  private lastWrite = 0;

  private pending = false;

  constructor(private readonly importId: string) {}

  /** Papers finished so far, which is what a continued run resumes from. */
  get done(): number { return this.state.done; }

  async stage(stage: ImportStage, label?: string): Promise<void> {
    this.state.stage = stage;
    if (label) this.state.label = label;
    // A new call means a new reply: the old tail is not this one's.
    if (stage === 'reading' || stage === 'reading-piece' || stage === 'answers' || stage === 'explaining') {
      this.state.chars = 0;
      this.state.tail = '';
    }
    this.state.percent = this.percentFor();
    await this.flush(true);
  }

  async paper(done: number, total: number, label: string): Promise<void> {
    this.state.done = done;
    this.state.total = Math.max(total, 1);
    this.state.label = label;
    this.state.percent = this.percentFor();
    await this.flush(true);
  }

  /** The model's own output, as it arrives. */
  delta(soFar: string): void {
    // The first piece is written straight away. It is the moment somebody
    // watching learns that something is happening at all, and on a fast model
    // the whole reply can arrive inside one throttle window — which used to
    // mean the live view showed nothing whatsoever.
    const first = !this.state.tail;
    this.state.chars = soFar.length;
    this.state.tail = soFar.length > TAIL_CHARS ? soFar.slice(-TAIL_CHARS) : soFar;
    void this.flush(first);
  }

  /**
   * How far along, in the only terms that are honest: which paper of how many,
   * and how far through that paper's stages. Within one model call there is no
   * way to know how much is left — the reply is as long as it needs to be — so
   * a stage is worth a fixed slice rather than pretending to measure it.
   */
  private percentFor(): number {
    const share: Record<ImportStage, number> = {
      queued: 0,
      extracting: 0.02,
      segmenting: 0.06,
      reading: 0.2,
      'reading-piece': 0.45,
      answers: 0.7,
      explaining: 0.85,
      saving: 0.95,
      done: 1,
      failed: 1,
    };
    const total = Math.max(this.state.total, 1);
    if (this.state.stage === 'done') return 100;
    if (this.state.stage === 'extracting' || this.state.stage === 'segmenting') {
      return Math.round(share[this.state.stage] * 100);
    }
    const within = share[this.state.stage ?? 'queued'] ?? 0;
    const perPaper = 1 / total;
    const value = 0.06 + 0.9 * (this.state.done * perPaper + within * perPaper);
    return Math.max(1, Math.min(99, Math.round(value * 100)));
  }

  private async flush(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastWrite < WRITE_EVERY_MS) return;
    if (this.pending) return;
    this.pending = true;
    this.lastWrite = now;
    this.state.updatedAt = new Date(now).toISOString();
    try {
      await imports.update(this.importId, { progress: JSON.stringify(this.state) });
    } catch {
      /* progress is a courtesy; losing one write must not fail the import */
    } finally {
      this.pending = false;
    }
  }

  /** Writes the final state, whatever the timer says. */
  async settle(stage: ImportStage, patch: Partial<Progress> = {}): Promise<void> {
    this.state = { ...this.state, ...patch, stage, tail: '', chars: 0 };
    this.state.percent = stage === 'done' ? 100 : this.percentFor();
    await this.flush(true);
  }
}

/** The options a job was started with, so a continuation matches the first run. */
export function optionsOf(record: ImportMeta): Partial<ImportOptions> {
  try { return JSON.parse(record.options || '{}') as Partial<ImportOptions>; } catch { return {}; }
}

function idsOf(record: ImportMeta): string[] {
  try { return JSON.parse(record.testIds || '[]') as string[]; } catch { return []; }
}

/**
 * Runs work after the response has been sent. On Vercel that needs the
 * platform's own hook, or the function is frozen the moment it answers; a
 * long-running Node server just keeps the promise.
 */
export function afterResponse(work: Promise<unknown>): void {
  const guarded = work.catch((err) => {
    console.error('[import] background work failed', err);
  });
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
      { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
    ctx?.get?.().waitUntil?.(guarded);
  } catch {
    /* not on Vercel: the promise runs to completion on its own */
  }
}

/** Reads the stored copy of an upload back, for a retry after a crash. */
async function storedBytes(record: ImportRow): Promise<Buffer | null> {
  if (!record.storageKey) return null;
  let ids: string[] = [];
  try { ids = JSON.parse(record.storedIn || '[]') as string[]; } catch { ids = []; }
  for (const id of ids) {
    const bucket = await bucketById(id);
    if (!bucket || bucket.kind !== 'hf') continue;
    const bytes = await getFile(asHfTarget(bucket), record.storageKey);
    if (bytes) return bytes;
  }
  return null;
}

/**
 * Saves one parsed paper: repair, fill the key, split off a listening section,
 * and write the papers out. Returns the ids it created, or an empty list with
 * a reason when the paper turned out to be empty.
 */
/**
 * Which folder a paper is filed under. The operator's own choice wins; failing
 * that the book's title; and with "file by type" ticked, the type is appended
 * so a mixed book sorts itself on the way in rather than by hand afterwards.
 */
function folderFor(opts: ImportOptions, source: string | null, content: ExamContent): string | undefined {
  const base = opts.folder ?? source ?? undefined;
  if (!opts.fileByType) return base;
  const label = typeFolder(content);
  if (!label) return base;
  return base ? `${base} / ${label}` : label;
}

async function savePaper(
  record: ImportRow,
  parsed: ExamContent,
  opts: ImportOptions,
  warnings: string[],
  source: string | null,
  report?: Reporter,
  /** Papers already in the bank, collected so they are reported once. */
  duplicateTitles: string[] = [],
): Promise<{ ids: string[]; duplicates: number }> {
  // The parse already normalised its own output; normalising again is cheap
  // and guarantees the repair pass has run over a hand-supplied draft too.
  const { content, warnings: normWarnings } = normaliseContent(parsed);
  warnings.push(...normWarnings);

  // A paper with no printed key is the common case, not the exception.
  if (countMissingAnswers(content) > 0 && opts.writeMissingAnswers !== false) {
    await report?.stage('answers');
    const config = await loadAiConfig('parse');
    const fill = await fillMissingAnswers({
      content,
      config,
      ctx: { feature: 'answer-key', orgId: opts.orgId, userId: opts.userId, meta: { importId: record.id } },
      onDelta: report ? (_chunk, soFar) => report.delta(soFar) : undefined,
    });
    warnings.push(...fill.warnings);
  }

  /*
   * Why the answer is the answer. Written here, once, while the paper is being
   * imported — the alternative is a teacher writing it out for every candidate
   * who asks, or a review screen that says "Incorrect" and nothing else.
   */
  if (opts.explain) {
    await report?.stage('explaining');
    const config = await loadAiConfig('parse');
    const explained = await explainAnswers({
      content,
      config,
      ctx: { feature: 'explanations', orgId: opts.orgId, userId: opts.userId, meta: { importId: record.id } },
      onDelta: report ? (_chunk, soFar) => report.delta(soFar) : undefined,
    });
    warnings.push(...explained.warnings);
  }

  await report?.stage('saving');

  if (!content.parts.length || totalQuestions(content) === 0) {
    throw new Error(
      content.parts.length
        ? 'The paper was read but no questions could be found in it. Check the file, or try the other strategy.'
        : 'Nothing could be read from that file — it may be an unsupported layout, or a scan that needs the vision provider.',
    );
  }

  // A listening section cannot be sat alongside a written one, and an IELTS
  // paper is a full test by definition: both become several papers grouped
  // together, in the order they are sat.
  const split = splitPaper(content, { whole: opts.keepWhole });
  warnings.push(...split.warnings);

  const created: Array<{ skill: string; id: string; listening: boolean }> = [];
  let duplicates = 0;
  for (const paper of split.papers) {
    /*
     * The same paper twice is the easiest mistake to make: a teacher is not
     * sure the first upload worked, tries again, and forty duplicates appear in
     * the bank. The fingerprint is taken over the questions themselves, so it
     * survives a second parse producing different ids and marks.
     */
    const body = JSON.stringify(paper.content);
    const fingerprint = fingerprintOf(body);
    if (fingerprint) {
      const twin = await tests.byFingerprint(opts.orgId, fingerprint);
      if (twin) {
        /*
         * One line per duplicate is how a re-uploaded book produced eighty
         * near-identical notes — and, when the twin has the same title, a line
         * that reads as if the paper were a duplicate of itself. The titles are
         * collected and the caller says it once.
         */
        duplicateTitles.push(
          twin.title === paper.content.title
            ? paper.content.title
            : `${paper.content.title} (same questions as “${twin.title}”)`,
        );
        duplicates += 1;
        continue;
      }
    }
    const listening = missingAudio(paper.content).length > 0;
    const row = await tests.create({
      orgId: opts.orgId,
      title: paper.content.title,
      module: paper.content.module,
      variant: paper.content.variant ?? 'academic',
      durationMin: paper.content.durationMinutes,
      /*
       * A listening paper with no recording yet must not go live by accident.
       * A bank paper is published as a matter of course: it is hidden from
       * every list and reached only through a full test, and a draft paper
       * cannot be drawn on to build one.
       */
      status: (opts.publish || opts.bank) && !listening ? 'published' : 'draft',
      content: body,
      bank: opts.bank,
      source,
      /*
       * Papers arrive in groups — a book, a batch written to order — so they
       * are filed together rather than dropped loose into the paper list. A
       * book that mixes everything (thirty grammar drills, four reading
       * passages, two writing tasks) is filed a level deeper, by what each
       * paper turned out to be, because "Cambridge 18" holding 36 papers of
       * six different kinds is a folder in name only.
       */
      folder: folderFor(opts, source, paper.content),
      // A paper out of a book belongs to the bank, not to the list of papers a
      // candidate scrolls through — it is reached through the full tests built
      // from it. A single upload keeps the ordinary private visibility.
      visibility: opts.bank ? 'suite' : undefined,
    });
    created.push({ skill: paper.skill, id: row.id, listening });
    if (listening) {
      warnings.push(
        `“${paper.content.title}” has ${totalQuestions(paper.content)} listening question(s) and no recording yet — `
        + 'open the paper and upload the MP3 (one file for the whole paper is the usual case), then publish it.',
      );
    }
  }

  if (split.split && created.length > 1) {
    const items: SuiteItem[] = created.map((c) => ({
      skill: c.skill as SuiteItem['skill'],
      testId: c.id,
      durationMin: 0,
      mode: 'online',
    }));
    const suite = await suites.create({
      orgId: opts.orgId,
      title: content.title,
      kind: split.ielts ? 'ielts' : 'custom',
      description: split.ielts
        ? 'Imported IELTS paper, sat skill by skill.'
        : 'Imported paper: the listening section is sat first, then the written paper.',
      status: 'draft',
      visibility: 'private',
      items,
    });
    warnings.push(`Grouped as the full test “${suite.title}” — publish it when the recording is in place.`);
  }

  return { ids: created.map((c) => c.id), duplicates };
}

/**
 * The whole job: read the upload — one paper or a book of them — and save what
 * comes out. Errors are recorded on the import row rather than thrown, because
 * nobody is waiting.
 */
export async function runImport(input: ImportRow, buffer: Buffer, opts: ImportOptions): Promise<void> {
  /*
   * Take the job first. Three things try to start one — the upload, every poll
   * of the import console, and the daily sweep — and two workers reading the
   * same book would save every paper twice. Whoever the row comes back to owns
   * it; everybody else stops here.
   */
  const record = await imports.claim(input.id);
  if (!record) return;

  const warnings: string[] = [];
  const report = new Reporter(record.id);
  try {
    let previous: string[] = [];
    try { previous = JSON.parse(record.warnings || '[]') as string[]; } catch { previous = []; }
    warnings.push(...previous);
    await imports.update(record.id, { error: null });

    const startAt = opts.startAt ?? progressOf(record).done;

    /*
     * Saving happens as each paper is read, not after the book is finished.
     * Two reasons, both learned the hard way: a book held whole in memory is
     * what makes a heavy upload take the site down with it, and a run that dies
     * half-way — a redeploy, a crash, a container that ran out of room — used
     * to lose every paper it had read. Now each one is in the bank the moment
     * it is read, and a continuation starts from the next one.
     */
    const ids = idsOf(record);
    let duplicates = 0;
    let read = 0;
    const duplicateTitles: string[] = [];
    // A holder rather than a plain variable: it is written inside the sink, and
    // the checker would otherwise narrow it to null at every later use.
    const firstPaper: { outcome: ParsedPaper['outcome'] | null } = { outcome: null };
    let source: string | null = null;
    let bookOpts: ImportOptions = opts;
    /*
     * Warnings are written back with every paper, so an unbounded list means a
     * bigger row written four hundred times — the last thing a heavy import
     * needs. Repeats are dropped, and past the cap only the count grows.
     */
    const MAX_WARNINGS = 200;
    const seen = new Set(warnings);
    /*
     * The same sentence twice is not twice the information. Notes that differ
     * only by which paper they came from are already collapsed where they are
     * produced — that is the one place the label and the sentence are still
     * separate — so an exact match is all that is needed here.
     */
    let extra = 0;
    const note = (line: string) => {
      if (seen.has(line)) return;
      seen.add(line);
      if (warnings.length < MAX_WARNINGS) warnings.push(line);
      else extra += 1;
    };
    const noted = () => (extra
      ? [...warnings, `…and ${extra} more note(s), left out to keep this record a sane size.`]
      : warnings);

    const keep = async (paper: ParsedPaper, book: boolean) => {
      if (!firstPaper.outcome) firstPaper.outcome = paper.outcome;
      read += 1;
      for (const line of paper.outcome.warnings) note(line);
      try {
        /*
         * Saving a paper produces its own notes — repaired options, a listening
         * paper with no recording, marks that do not add up. They are collected
         * apart and put through `note()` so a book's hundred and twenty papers
         * do not leave a hundred and twenty copies of the same sentence.
         */
        const mine: string[] = [];
        const saved = await savePaper(
          record, paper.outcome.content, bookOpts, mine, source, report, duplicateTitles,
        );
        for (const line of mine) note(paper.label ? `${paper.label}: ${line}` : line);
        ids.push(...saved.ids);
        duplicates += saved.duplicates;
      } catch (err) {
        // One unreadable paper in a book must not lose the other nineteen.
        if (!book) throw err;
        note(`${paper.label}: ${(err as Error).message}`);
      }
      await imports.update(record.id, {
        testIds: JSON.stringify(ids),
        warnings: JSON.stringify(noted()),
      });
    };

    const collection = await parseCollection(record.filename, record.mimeType, buffer, {
      strategy: opts.strategy,
      module: opts.module,
      title: opts.title,
      orgId: opts.orgId,
      userId: opts.userId,
      startAt,
      keyText: opts.keyText,
      forceBook: opts.book,
      grain: opts.grain,
      keyFromPage: opts.keyFromPage,
      keyFirst: opts.keyFirst,
      whole: opts.keepWhole,
      pretext: opts.pretext,
      /*
       * Kept as soon as it is read, not at the end. A continuation needs the
       * text, not the file, and the file is the part that goes missing.
       */
      onExtracted: async (text) => {
        await imports.update(record.id, { extractedText: text.slice(0, KEEP_TEXT_CHARS) });
      },
      budgetMs: timeBudget(),
      onPaper: (done, total, label) => report.paper(done, total, label),
      onStage: (stage, label) => { void report.stage(stage, label); },
      onDelta: (_chunk, soFar) => report.delta(soFar),
      /*
       * Said as it happens. Everything the run has to say about the *upload* —
       * how it was cut, whether the key was found and shared out — used to
       * arrive when the last paper was done, which on a book is twenty minutes
       * after the operator wanted to know.
       */
      onNote: async (line) => {
        note(line);
        await imports.update(record.id, { warnings: JSON.stringify(noted()) });
      },
      /*
       * Whether this upload is a book is only known once it has been cut up,
       * and the first paper arrives immediately after that — so the two things
       * that depend on it are settled here, on the first call, rather than
       * being read off a result that does not exist yet.
       */
      onParsed: async (paper) => {
        if (!read) {
          const book = paper.label !== '';
          // A book goes to the bank by definition: nobody wants forty separate
          // papers in the list, they want tests built out of them.
          bookOpts = { ...opts, bank: opts.bank ?? book };
          source = book
            ? (opts.title || record.filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim())
            : null;
        }
        await keep(paper, paper.label !== '');
      },
    });
    for (const line of collection.warnings) note(line);

    if (!ids.length) {
      /*
       * Nothing new was saved. That is a failure if the file could not be read,
       * and a perfectly good outcome if every paper in it was already here —
       * which is what happens when somebody uploads the same book twice.
       */
      if (duplicates > 0) {
        await report.settle('done', { done: startAt + collection.read, total: collection.total });
        await imports.update(record.id, {
          status: 'committed',
          warnings: JSON.stringify(noted()),
        });
        return;
      }
      throw new Error(
        'Nothing could be read from that file — it may be an unsupported layout, or a scan that needs the vision provider.',
      );
    }

    const done = startAt + collection.read;
    const first = firstPaper.outcome;

    if (duplicateTitles.length) {
      const shown = duplicateTitles.slice(0, 3).map((t) => `“${t}”`).join(', ');
      note(
        `${duplicateTitles.length} paper(s) were already in your papers and were not saved again `
        + `(${shown}${duplicateTitles.length > 3 ? `, and ${duplicateTitles.length - 3} more` : ''}). `
        + 'Uploading the same book twice is the usual reason; delete the old ones first if you meant to replace them.',
      );
    }

    // The run stopped on its time budget with papers still to read. It goes
    // back in the queue with its place kept, and the sweep carries on.
    if (collection.remaining > 0) {
      note(
        `${done} of ${collection.total} papers have been read so far; the rest continue in the background.`,
      );
      await report.settle('queued', { done, total: collection.total });
      await imports.update(record.id, {
        status: 'queued',
        // The claim is released with the job, so the next sweep can pick it up
        // rather than waiting out the stale timeout.
        claimedAt: null,
        testIds: JSON.stringify(ids),
        warnings: JSON.stringify(noted()),
        provider: first?.usedAi ? `${first.provider}:${first.model ?? ''}` : 'rules',
      });
      /*
       * Serverless has a sweep to pick this up; a server of one's own has
       * nobody, so the job would sit at "paused after 40 of 300 papers" until
       * somebody happened to open the import screen. It asks for its own next
       * slice instead, after a pause long enough to serve whatever queued up
       * behind it.
       */
      if (!process.env.VERCEL) {
        setTimeout(() => { void resumeStalled(1, true).catch(() => undefined); }, 1_500).unref?.();
      }
      return;
    }

    await report.settle('done', { done, total: collection.total });
    await imports.update(record.id, {
      status: 'committed',
      testId: ids[0],
      testIds: JSON.stringify(ids),
      provider: first?.usedAi ? `${first.provider}:${first.model ?? ''}` : 'rules',

      draft: first ? JSON.stringify(first.content) : null,
      warnings: JSON.stringify(noted()),
      strategy: first?.strategy ?? opts.strategy,
    });

    // The papers exist now, so nothing after this point may fail the import.
    // The file has served its purpose; retention decides when it goes, and a
    // storage hiccup only leaves it for the next sweep.
    try {
      const hours = await retentionHoursFor(opts.orgId);
      if (hours === 0) {
        const fresh = await imports.byId(record.id);
        if (fresh?.storageKey) await purgeImport(fresh);
      }
    } catch (err) {
      warnings.push(`The uploaded file could not be deleted yet: ${(err as Error).message}`);
      await imports.update(record.id, { warnings: JSON.stringify(noted()) });
    }
  } catch (err) {
    const message = (err as Error).message;
    await report.settle('failed');
    await imports.update(record.id, {
      status: 'failed', error: message, warnings: JSON.stringify(warnings),
    });
    const fresh = await imports.byId(record.id);
    if (fresh?.storageKey) await purgeImport(fresh).catch(() => undefined);
  }
}

/* ------------------------- papers written to order ---------------------- */

export interface ComposeOptions extends Omit<ImportOptions, 'strategy' | 'startAt'> {
  instructions: string;
  sample?: string;
  questions?: number;
  minutes?: number;
  scoring?: 'band' | 'points';
  paperTitle?: string;
  /**
   * Set when a candidate asked for the paper. It is then wrapped in a full test
   * of their own, so it appears on their dashboard and nobody else's.
   */
  forUserId?: string | null;
}

/**
 * Writes a paper with the model and saves it, on the same background footing as
 * an import — the request comes back at once and the console shows the job.
 */
export async function runCompose(input: ImportRow, opts: ComposeOptions): Promise<void> {
  const record = await imports.claim(input.id);
  if (!record) return;

  const warnings: string[] = [];
  const report = new Reporter(record.id);
  try {
    await imports.update(record.id, { error: null });
    await report.paper(0, 1, opts.paperTitle ?? 'Your paper');
    await report.stage('reading');

    const result = await composePaper(
      {
        instructions: opts.instructions,
        sample: opts.sample,
        module: opts.module,
        questions: opts.questions,
        minutes: opts.minutes,
        scoring: opts.scoring,
        title: opts.paperTitle,
        onDelta: (_chunk, soFar) => report.delta(soFar),
      },
      { feature: 'parse', orgId: opts.orgId, userId: opts.userId, meta: { importId: record.id, composed: true } },
    );
    warnings.push(...result.warnings);

    const saveOpts: ImportOptions = {
      ...opts,
      strategy: 'ai',
      // A paper written for one candidate is theirs: it is reached through the
      // test built around it, not from the organisation's list of papers.
      bank: opts.bank ?? !opts.forUserId,
    };
    const { ids } = await savePaper(record, result.content, {
      ...saveOpts,
      folder: opts.folder ?? 'Written by the AI',
    }, warnings, 'Written by the AI', report);

    // The candidate asked for something to sit, so give them something to open.
    if (opts.forUserId && ids.length) {
      const paper = await tests.byId(ids[0]);
      const suite = await suites.create({
        orgId: opts.orgId,
        title: paper?.title ?? 'Your paper',
        kind: 'composed',
        description: `Written to order: ${opts.instructions.slice(0, 160)}`,
        status: 'published',
        visibility: 'private',
        items: ids.map((testId, i) => ({
          skill: (i === 0 ? (paper?.module === 'listening' ? 'listening' : paper?.module === 'writing' ? 'writing' : 'reading') : 'reading') as SuiteItem['skill'],
          testId,
          durationMin: paper?.durationMin ?? 0,
          mode: 'online' as const,
        })),
        settings: { assembledFor: opts.forUserId, assembledAt: new Date().toISOString() },
      });
      warnings.push(`Ready to sit as “${suite.title}”.`);
    }

    await report.settle('done', { done: 1, total: 1 });
    await imports.update(record.id, {
      status: 'committed',
      testId: ids[0] ?? null,
      testIds: JSON.stringify(ids),
      provider: `${result.provider}:${result.model}`,
      draft: JSON.stringify(result.content),
      warnings: JSON.stringify(warnings),
      strategy: 'ai',
    });
  } catch (err) {
    await report.settle('failed');
    await imports.update(record.id, {
      status: 'failed', error: (err as Error).message, warnings: JSON.stringify(warnings),
    });
  }
}

export function startCompose(record: ImportRow, opts: ComposeOptions): void {
  afterResponse(runCompose(record, opts));
}

/* ------------------ explanations for a paper already here --------------- */

export interface ExplainJobOptions {
  orgId: string;
  userId: string | null;
  testId: string;
  /** Rewrite the explanations that are already there. */
  redo?: boolean;
}

/**
 * Writes the answer explanations for a paper that is already in the bank.
 *
 * Papers imported before this existed have none, and a teacher who did not
 * tick the box at upload time should not have to import the paper again. It
 * runs on the same footing as an import — claimed, streamed, resumable — so the
 * console shows it the same way.
 */
export async function runExplain(input: ImportRow, opts: ExplainJobOptions): Promise<void> {
  const record = await imports.claim(input.id);
  if (!record) return;

  const warnings: string[] = [];
  const report = new Reporter(record.id);
  try {
    const paper = await tests.byId(opts.testId);
    if (!paper || paper.orgId !== opts.orgId) throw new Error('That paper is no longer here.');

    const content = JSON.parse(paper.content) as ExamContent;
    await report.paper(0, 1, paper.title);
    await report.stage('explaining');

    const result = await explainAnswers({
      content,
      redo: opts.redo,
      ctx: {
        feature: 'explanations',
        orgId: opts.orgId,
        userId: opts.userId,
        meta: { importId: record.id, testId: paper.id },
      },
      onProgress: ({ done, total, label }) => report.paper(0, 1, `${label} — ${done} of ${total} questions`),
      onDelta: (_chunk, soFar) => report.delta(soFar),
    });
    warnings.push(...result.warnings);

    await report.stage('saving');
    // Normalised on the way in like any other save, so the explanations go
    // through the same shape check as everything else on the paper.
    const { content: clean, warnings: normWarnings } = normaliseContent(content);
    warnings.push(...normWarnings);
    await tests.update(paper.id, { content: JSON.stringify(clean) });

    await report.settle('done', { done: 1, total: 1 });
    await imports.update(record.id, {
      status: 'committed',
      testId: paper.id,
      testIds: JSON.stringify([paper.id]),
      warnings: JSON.stringify(warnings),
    });
  } catch (err) {
    await report.settle('failed');
    await imports.update(record.id, {
      status: 'failed', error: (err as Error).message, warnings: JSON.stringify(warnings),
    });
  }
}

export function startExplain(record: ImportRow, opts: ExplainJobOptions): void {
  afterResponse(runExplain(record, opts));
}

/** Starts the job and returns immediately. */
export function startImport(record: ImportRow, buffer: Buffer, opts: ImportOptions): void {
  afterResponse(inLane(() => runImport(record, buffer, opts)));
}

/**
 * Picks up imports whose worker died — a redeploy mid-parse, a crashed
 * function — and runs them again from the stored copy. Called by the hourly
 * sweep and whenever staff open the import screen.
 */
/** The last time this process swept, so a polling console cannot stampede it. */
let lastSweep = 0;

export async function resumeStalled(limit = 3, force = false): Promise<number> {
  /*
   * The import console polls every couple of seconds and each poll used to run
   * a sweep: two queries and, for anything paused, a fetch of the stored upload
   * from Hugging Face — every 2.5 seconds, while the machine was already busy
   * reading a book. Once every fifteen seconds is plenty; a job that finished a
   * slice asks for the next one directly (with `force`) rather than waiting.
   */
  if (!force && Date.now() - lastSweep < 15_000) return 0;
  lastSweep = Date.now();
  return sweep(limit);
}

async function sweep(limit: number): Promise<number> {
  // A book that ran out of invocation time is waiting deliberately, so it goes
  // first and does not wait for the stall timeout.
  const partial = await imports.partial(limit);
  const stale = await imports.stalled(20, Math.max(0, limit - partial.length));
  let started = 0;
  for (const record of [...partial, ...stale]) {
    const bytes = await storedBytes(record);
    /*
     * The file is gone — storage was never configured, the write failed, or
     * retention took it. The *text* is still on the row, and that is all a
     * continuation needs, so the other three hundred papers are not lost with
     * the .docx.
     */
    const pretext = bytes ? undefined : (record.extractedText || undefined);
    if (!bytes && !pretext) {
      const saved = idsOf(record).length;
      await imports.update(record.id, saved
        ? {
          // Papers were saved. Reporting that as a failure would be a lie, and
          // would hide them: the honest ending is "this much, and why no more".
          status: 'committed',
          error: null,
          warnings: JSON.stringify([
            ...JSON.parse(record.warnings || '[]') as string[],
            `Reading stopped after ${saved} paper(s): the uploaded file is no longer stored and the `
            + 'text kept for continuing was not there either. Those papers are in your bank; upload '
            + 'the file again to read the rest.',
          ]),
        }
        : {
          status: 'failed',
          error: 'Parsing stopped part-way and the uploaded file is no longer stored, so it cannot be retried. Upload it again.',
        });
      continue;
    }
    let strategy: Strategy = 'hybrid';
    if (record.strategy === 'rules' || record.strategy === 'ai') strategy = record.strategy;
    startImport(record, bytes ?? Buffer.alloc(0), {
      ...optionsOf(record),
      strategy, orgId: record.orgId, userId: null,
      startAt: progressOf(record).done,
      pretext,
    });
    started += 1;
  }
  return started;
}

/** Where an import got to, in words the console can show. */
export function importStage(record: ImportMeta): {
  label: string; done: boolean; failed: boolean; percent: number; progress: Progress;
} {
  const progress = progressOf(record);
  // A book says which paper it is on; a single upload has nothing to count.
  const of = progress.total > 1 ? ` · paper ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : '';
  const named = progress.stage ? STAGE_LABEL[progress.stage] : null;
  switch (record.status) {
    case 'queued':
      return {
        label: progress.total > 1 ? `Paused after ${progress.done} of ${progress.total} papers` : 'Waiting to start',
        done: false, failed: false, percent: progress.percent ?? 0, progress,
      };
    case 'parsing':
      return {
        label: `${named ?? 'Reading the paper'}${progress.label && progress.total > 1 ? ` — ${progress.label}` : ''}${of}`,
        done: false, failed: false, percent: progress.percent ?? 1, progress,
      };
    case 'parsed':
      return { label: 'Parsed, awaiting save', done: false, failed: false, percent: progress.percent ?? 90, progress };
    case 'committed': {
      // What was actually saved, not what was read: a book uploaded twice is
      // read in full and saved not at all.
      let saved = 0;
      try { saved = (JSON.parse(record.testIds || '[]') as string[]).length; } catch { saved = 0; }
      return {
        label: saved > 1
          ? `${saved} papers in your bank`
          : saved === 1
            ? 'In your papers'
            : 'Read — nothing new to save',
        done: true, failed: false, percent: 100, progress,
      };
    }
    case 'failed':
      return { label: 'Failed', done: true, failed: true, percent: 100, progress };
    default:
      return { label: record.status, done: false, failed: false, percent: progress.percent ?? 0, progress };
  }
}
