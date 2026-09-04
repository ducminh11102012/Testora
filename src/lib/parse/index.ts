import { ExamContent, FAMILY_OF, allQuestions, renumber } from '@/types/exam';
import { Extracted, extractFile } from './extract';
import { NO_KEY_NOTE, parseAnswerKey, parseMarkingNotes, parseWithRules } from './rules';
import {
  CHUNK_CHARS, MAX_CHARS, ProviderName, buildPrompt, buildVisionPrompt, configuredProvider, splitForModel,
} from './ai';
import { isConfigured, loadAiConfig } from '../ai/config';
import { outputCap, wireOf } from '../ai/models';
import { callModel } from '../ai/provider';
import { askJson } from '../ai/ask-json';
import { normaliseContent } from './normalize';
import { needsKey, readAnswerKey } from '../ai/answers';
import { looksLikeIelts } from './split';
import { looksLikeImage, looksScanned, pagesFor } from './pages';
import {
  BookSegment, Grain, findKeyRegion, keyEntries, segmentBook, shareOutKey,
} from './book';

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
  /** True when the paper was read from page images rather than a text layer. */
  usedVision?: boolean;
  /** What the AI pass cost, in US cents. Shown to the organisation. */
  costCents?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/*
 * There is no output budget here any more. A paper's JSON is longer than the
 * paper, so any ceiling this file picked was a ceiling some paper would hit;
 * the request now carries whatever the operator set under Platform → AI, and
 * nothing at all when they set none. Length is handled where it belongs —
 * long documents are read a piece at a time.
 */

/**
 * Decides how a paper is reported when the model did not say — and reads the
 * printed total out of the paper when it is there.
 *
 * The default matters: a Vietnamese gifted-student paper reported as "Band 6.5"
 * is nonsense to the school that set it, so anything that does not look like
 * IELTS is marked in points out of its own total.
 */
function settleScoring(content: ExamContent, rawText: string, warnings: string[]): void {
  if (!content.scoring) {
    content.scoring = looksLikeIelts(content) ? 'band' : 'points';
  }
  if (content.scoring === 'points' && content.variant !== 'school' && !looksLikeIelts(content)) {
    content.variant = 'school';
  }

  if (content.scoring === 'points' && !content.totalPoints) {
    // "Tổng điểm: 20", "(20,0 điểm)", "Total: 100 marks", "ĐIỂM: 10"
    const head = `${content.title}\n${rawText.slice(0, 4000)}`;
    const patterns = [
      /t[oổ]ng\s*[đd]i[eể]m\s*[:\-]?\s*(\d{1,3})(?:[.,](\d))?/i,
      /\((\d{1,3})(?:[.,](\d))?\s*[đd]i[eể]m\)/i,
      /\btotal\s*[:\-]?\s*(\d{1,3})(?:\.(\d))?\s*(?:marks?|points?)\b/i,
      /\b(\d{1,3})(?:\.(\d))?\s*(?:marks?|points?)\s+in\s+total\b/i,
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m) {
        const value = Number(`${m[1]}.${m[2] ?? 0}`);
        if (value > 0 && value <= 200) {
          content.totalPoints = value;
          warnings.push(`The paper is marked out of ${value} point(s), so it is reported in points, not bands.`);
        }
        break;
      }
    }
    if (!content.totalPoints) {
      // The sections may still add up to a total worth reporting.
      const sections = content.parts.reduce((sum, p) => sum + (p.points ?? 0), 0);
      if (sections > 0) {
        content.totalPoints = Math.round(sections * 10) / 10;
        warnings.push(`The sections add up to ${content.totalPoints} point(s), which is what results are reported out of.`);
      } else {
        warnings.push('This paper is not IELTS, so it is marked in points — one mark a question unless you set the marks in the editor.');
      }
    }
  }
}

/** Joins the pieces of a chunked read back into one paper. */
function mergeParsed(pieces: ExamContent[], moduleHint?: string): ExamContent {
  const parts = pieces.flatMap((p) => p.parts);
  const modules = new Set(pieces.map((p) => p.module));
  return {
    ...pieces[0],
    title: pieces.find((p) => p.title && p.title !== 'Imported test')?.title ?? pieces[0].title,
    // Pieces that disagree about the module were pieces of a mixed paper.
    module: (moduleHint as ExamContent['module'])
      ?? (modules.size > 1 ? 'mixed' : pieces[0].module),
    durationMinutes: Math.max(...pieces.map((p) => p.durationMinutes || 0)),
    parts,
  };
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

/**
 * Applies a separately-uploaded answer key to a paper: the rule parser first,
 * because a key laid out as a plain list needs no model at all, and the model
 * for whatever is left. Any marking instructions printed with the key are kept
 * on the paper, because that rubric is the one the school marks by.
 */
async function applyKeyText(
  content: ExamContent,
  keyText: string,
  warnings: string[],
  opts: { orgId?: string | null; userId?: string | null; useAi: boolean },
): Promise<void> {
  const entries = content.parts
    .flatMap((part) => part.groups.flatMap((group) => group.questions.map((q) => ({ group, q }))));
  const byNumber = new Map(entries.map(({ group, q }) => [q.number, { group, q }]));

  // The whole file is the key, so there is no heading to look for.
  const printed = parseAnswerKey(keyText, { whole: true });
  let filled = 0;
  let corrected = 0;
  for (const [number, values] of Object.entries(printed)) {
    const entry = byNumber.get(Number(number));
    if (!entry || !values.length) continue;
    /*
     * The printed key wins. It used to be applied only where nothing was there
     * yet, which sounds careful and is the opposite: a model reading a drill
     * paper answers every question whether or not it can tell, so by the time
     * the key arrived every question "already had an answer" and the answers
     * actually printed in the book were thrown away. What the book prints beats
     * what a model inferred, every time.
     */
    const had = entry.q.answers.join('|');
    if (had && had === values.join('|')) continue;
    entry.q.answers = values;
    if (had) corrected += 1; else filled += 1;
  }
  if (filled || corrected) {
    /*
     * The rule pass said "no printed answer key was found", which was true of
     * the paper and is no longer true of the paper *plus its key*. Leaving both
     * notes on the same import is how an operator ends up not believing either.
     */
    const stale = warnings.indexOf(NO_KEY_NOTE);
    if (stale >= 0) warnings.splice(stale, 1);
  }
  if (filled) warnings.push(`${filled} answer(s) were read straight out of the printed key.`);
  if (corrected) {
    warnings.push(
      `${corrected} answer(s) already on the paper disagreed with the printed key and were replaced `
      + 'by what the key says.',
    );
  }

  // A rubric printed in the key, read without a model where the key labels it.
  const printedNotes = parseMarkingNotes(keyText);
  if (printedNotes && !content.markingNotes) {
    content.markingNotes = printedNotes;
    warnings.push('The answer key carried marking instructions, which are now on the paper and go to whoever marks the writing.');
  }

  const missing = entries.filter(({ group, q }) => needsKey(group, q)).map(({ q }) => q.number);
  if (!missing.length || !opts.useAi) {
    if (missing.length) {
      warnings.push(`${missing.length} question(s) are still without an answer after reading the key file.`);
    }
    return;
  }

  const read = await readAnswerKey({
    keyText,
    numbers: missing,
    ctx: { feature: 'answer-key', orgId: opts.orgId, userId: opts.userId, meta: { fromKeyFile: true } },
  });
  warnings.push(...read.warnings);
  for (const [number, values] of Object.entries(read.answers)) {
    const entry = byNumber.get(Number(number));
    if (!entry || !values.length) continue;
    if (FAMILY_OF[entry.group.type] === 'fields' && entry.q.fields?.length) {
      entry.q.fields = entry.q.fields.map((f, i) => (
        f.answers.length ? f : { ...f, answers: values[i] ? [values[i]] : [] }
      ));
      continue;
    }
    entry.q.answers = values;
  }
  if (read.markingNotes && !content.markingNotes) content.markingNotes = read.markingNotes;
}

/**
 * Reads page images with the vision provider and normalises the result. Returns
 * null when no vision provider is configured, so the caller can fall back.
 */
async function visionParse(
  filename: string,
  mime: string,
  buffer: Buffer,
  opts: {
    module?: string; title?: string; orgId?: string | null; userId?: string | null;
    onDelta?: (chunk: string, soFar: string) => void;
  },
  warnings: string[],
): Promise<Omit<ParseOutcome, 'extracted'> | null> {
  const config = await loadAiConfig('vision');
  if (!isConfigured(config)) return null;

  const pages = await pagesFor(filename, mime, buffer, wireOf(config));
  const asked = await askJson(
    {
      prompt: buildVisionPrompt({ pages: pages.images.length, module: opts.module, note: pages.note }),
      system: 'You transcribe exam papers from images and return only valid JSON.',
      images: pages.images,
      maxTokens: outputCap(config),
      onDelta: opts.onDelta,
    },
    { feature: 'vision-parse', orgId: opts.orgId, userId: opts.userId, meta: { pages: pages.images.length } },
    config,
  );
  const result = asked.result;
  warnings.push(...asked.warnings);

  const { content, warnings: normWarnings } = normaliseContent(asked.value);
  warnings.push(pages.note, ...normWarnings);
  if (opts.title) content.title = opts.title;
  if (opts.module) content.module = opts.module as ExamContent['module'];

  return {
    content: ensureUniqueNumbers(content, warnings),
    warnings,
    strategy: 'ai',
    usedAi: true,
    usedVision: true,
    provider: config.provider,
    model: config.model,
    ruleConfidence: 0,
    costCents: result.costMicros / 10_000,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

export async function parseDocument(
  filename: string,
  mime: string,
  buffer: Buffer,
  opts: {
    strategy?: Strategy;
    module?: 'reading' | 'listening' | 'writing' | 'mixed';
    title?: string;
    /** Recorded against the organisation so the platform can bill or report it. */
    orgId?: string | null;
    userId?: string | null;
  } = {},
): Promise<ParseOutcome> {
  // A photograph, or a scan with no text layer, can only be read by a model
  // that can see. That is a different provider, and a different prompt.
  const asImage = looksLikeImage(filename, mime);
  const extracted = asImage
    ? { text: '', warnings: [] as string[] }
    : await extractFile(filename, mime, buffer);
  const warnings = [...extracted.warnings];

  const scanned = asImage || looksScanned(extracted.text, extracted.pages ?? 1);
  if (scanned && opts.strategy !== 'rules') {
    const vision = await visionParse(filename, mime, buffer, opts, warnings);
    if (vision) return { ...vision, extracted };
    if (asImage) {
      throw new Error(
        'This paper is an image, so it needs a vision provider. Set one up under '
        + 'Platform → AI settings ("Reading photographs and scans").',
      );
    }
    warnings.push('The PDF has almost no text in it, which usually means a scan. No vision provider is configured, so the rule parser read what little text there was.');
  }

  const baseTitle = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const parsed = await parseText(extracted.text, { ...opts, fallbackTitle: baseTitle, warnings });
  return { ...parsed, extracted };
}

export interface TextParseOptions {
  strategy?: Strategy;
  /**
   * The printed answer key, when it arrived as its own file. Papers are
   * published that way constantly — the paper for the candidates, the key for
   * the teacher — and the key often carries the marking rubric as well.
   */
  keyText?: string;
  module?: 'reading' | 'listening' | 'writing' | 'mixed';
  /** What the operator called this paper. Wins over anything the model chose. */
  title?: string;
  /** Used when nobody named the paper — the file name, or "Test 3" in a book. */
  fallbackTitle?: string;
  orgId?: string | null;
  userId?: string | null;
  /** Warnings collected so far, appended to rather than replaced. */
  warnings?: string[];
  /**
   * Read the key with the model first and hand its answers to the paper pass.
   * Without this the key is applied *after* parsing, which works, but the model
   * has already guessed at every answer by then — and a guess it has written
   * down reads exactly like an answer somebody printed.
   */
  keyFirst?: boolean;
  /**
   * Called with the model's output as it arrives. Reading a paper takes a
   * minute or two, and a spinner for two minutes looks exactly like a spinner
   * for ever — so the console shows what the model is writing while it writes.
   */
  onDelta?: (chunk: string, soFar: string) => void;
  /** Called when the job moves on to another kind of work. */
  onStage?: (stage: ParseStage, label?: string) => void;
}

/** The steps a read goes through, in the order they happen. */
export type ParseStage =
  | 'extracting'
  | 'segmenting'
  | 'reading'
  | 'reading-piece'
  | 'answers'
  | 'explaining'
  | 'saving';

/**
 * The reading itself, from text that is already out of the file. A book is
 * split into its papers first and each one comes through here on its own, so
 * this function only ever sees a single paper's worth of text.
 */
export async function parseText(
  source: string,
  opts: TextParseOptions = {},
): Promise<Omit<ParseOutcome, 'extracted'>> {
  const warnings = opts.warnings ?? [];
  const rules = parseWithRules(source, { module: opts.module, title: opts.title || opts.fallbackTitle });
  warnings.push(...rules.warnings);

  const config = await loadAiConfig('parse');
  const provider = await configuredProvider();
  const wantAi = opts.strategy !== 'rules' && provider !== 'none' && config.parsingEnabled;

  if (!wantAi) {
    if (opts.strategy !== 'rules' && provider === 'none') {
      warnings.push('No AI provider is configured — used the rule-based parser only. A platform administrator can turn the model pass on under Platform → AI.');
    } else if (opts.strategy !== 'rules' && !config.parsingEnabled) {
      warnings.push('AI parsing is switched off for this platform — used the rule-based parser only.');
    }
    settleScoring(rules.content, source, warnings);
    if (opts.keyText) {
      await applyKeyText(rules.content, opts.keyText, warnings, {
        orgId: opts.orgId, userId: opts.userId, useAi: false,
      });
    }
    return {
      content: ensureUniqueNumbers(rules.content, warnings), warnings, strategy: 'rules', usedAi: false,
      provider: 'none', ruleConfidence: rules.confidence,
    };
  }

  let text = source;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warnings.push(`The document is very long; only the first ${MAX_CHARS.toLocaleString()} characters were sent to the model.`);
  }

  try {
    const scaffold = opts.strategy === 'ai' ? undefined : scaffoldSummary(rules.content);
    const ctx = { feature: 'parse' as const, orgId: opts.orgId, userId: opts.userId };

    /*
     * The key, read first. The rule parser has already lifted whatever it could
     * out of a plainly-laid-out key; anything left goes to the model, and the
     * result is handed to the paper pass below so the model copies instead of
     * solving. It is also applied again after parsing, because a model that has
     * been given a key can still fail to use it.
     */
    let keyForPrompt = '';
    if (opts.keyText && opts.keyFirst !== false) {
      const printed = parseAnswerKey(opts.keyText, { whole: true });
      const numbers = allQuestions(rules.content).map((q) => q.number);
      const missing = numbers.filter((n) => !printed[n]?.length);
      if (missing.length && numbers.length) {
        const read = await readAnswerKey({
          keyText: opts.keyText,
          numbers: missing,
          ctx: { ...ctx, feature: 'answer-key' },
        });
        warnings.push(...read.warnings);
        for (const [number, values] of Object.entries(read.answers)) {
          if (values.length) printed[Number(number)] = values;
        }
      }
      const lines = Object.entries(printed)
        .filter(([, values]) => values.length)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([number, values]) => `${number}. ${values.join(' | ')}`);
      if (lines.length) {
        keyForPrompt = lines.join('\n');
        warnings.push(`The printed key was read first: ${lines.length} answer(s) went to the model with the paper.`);
      }
    }

    /** One call. Returns the parsed content and whether the reply was cut off. */
    const readWhole = async () => {
      opts.onStage?.('reading');
      const asked = await askJson(
        {
          prompt: buildPrompt(text, { module: opts.module, scaffold, key: keyForPrompt || undefined }),
          system: 'You return only valid JSON. No prose, no markdown fences.',
          maxTokens: outputCap(config),
          onDelta: opts.onDelta,
        },
        { ...ctx, meta: { chars: text.length } },
        config,
      );
      warnings.push(...asked.warnings);
      const result = asked.result;
      const json = { value: asked.value, repaired: asked.repaired, truncated: asked.truncated };
      const cut = json.truncated || result.finishReason === 'length';
      return { result, json, cut };
    };

    let attempt = await readWhole();
    let result = attempt.result;
    let parsed: unknown = attempt.json.value;
    let cost = result.costMicros;
    let inputTokens = result.inputTokens;
    let outputTokens = result.outputTokens;

    /*
     * A long paper's JSON is longer than the paper, and a model that runs out of
     * output budget leaves a document that cannot be read — which used to throw
     * the whole pass away and fall back to the rule parser. When that happens
     * the paper is read again in printed pieces (sections, parts, question
     * ranges) and the pieces are joined back together.
     */
    if (attempt.cut && text.length > CHUNK_CHARS) {
      const pieces = splitForModel(text);
      warnings.push(
        `The paper is too long for one model reply (${pieces.length} pieces), so it was read section by section.`,
      );
      const collected: ExamContent[] = [];
      for (const [i, piece] of pieces.entries()) {
        opts.onStage?.('reading-piece', `piece ${i + 1} of ${pieces.length}`);
        try {
          const asked = await askJson(
            {
              prompt: buildPrompt(piece, {
                module: opts.module,
                chunk: { index: i + 1, total: pieces.length },
                key: keyForPrompt || undefined,
              }),
              system: 'You return only valid JSON. No prose, no markdown fences.',
              maxTokens: outputCap(config),
              onDelta: opts.onDelta,
            },
            { ...ctx, meta: { chars: piece.length, piece: i + 1, of: pieces.length } },
            config,
          );
          cost += asked.result.costMicros;
          inputTokens += asked.result.inputTokens;
          outputTokens += asked.result.outputTokens;
          for (const line of asked.warnings) warnings.push(`Piece ${i + 1} of ${pieces.length}: ${line}`);
          collected.push(normaliseContent(asked.value).content);
        } catch (err) {
          warnings.push(`Piece ${i + 1} of ${pieces.length} could not be read — ${(err as Error).message}`);
        }
      }
      if (!collected.length) throw new Error('None of the pieces could be read.');
      parsed = mergeParsed(collected, opts.module);
      result = { ...result, costMicros: cost, inputTokens, outputTokens };
    } else if (attempt.json.truncated) {
      warnings.push('The model ran out of room and its reply was repaired — check the end of the paper carefully.');
    }

    const { content, warnings: normWarnings } = normaliseContent(parsed);
    warnings.push(...normWarnings);

    if (opts.title) content.title = opts.title;
    else if (opts.fallbackTitle && (!content.title || content.title === 'Imported test')) {
      content.title = opts.fallbackTitle;
    }
    if (opts.module) content.module = opts.module;
    settleScoring(content, source, warnings);

    // Backfill answers the model left empty from the rule-parsed key.
    const key = { ...parseAnswerKey(source), ...rules.answerKey };
    let filled = 0;
    for (const q of allQuestions(content)) {
      if (!q.answers.length && key[q.number]?.length) { q.answers = key[q.number]; filled++; }
    }
    if (filled) warnings.push(`${filled} answer(s) were recovered from the printed answer key.`);

    // A key that came as its own file is applied here, after the paper has its
    // questions: the numbers have to exist before anything can be filed against
    // them.
    if (opts.keyText) {
      await applyKeyText(content, opts.keyText, warnings, {
        orgId: opts.orgId, userId: opts.userId, useAi: true,
      });
    }

    // An essay has no answer key by nature, so it is not "missing" one.
    const missing = content.parts
      .flatMap((part) => part.groups.flatMap((group) => group.questions.map((q) => ({ group, q }))))
      .filter(({ group, q }) => needsKey(group, q))
      .map(({ q }) => q);
    if (missing.length) {
      warnings.push(`${missing.length} question(s) still have no answer key: ${missing.slice(0, 12).map((q) => q.number).join(', ')}${missing.length > 12 ? '…' : ''}`);
    }
    if (!content.parts.length) throw new Error('The model returned no parts.');

    return {
      content: ensureUniqueNumbers(content, warnings), warnings, strategy: opts.strategy ?? 'hybrid',
      usedAi: true, provider, model: result.model, ruleConfidence: rules.confidence,
      costCents: cost / 10_000,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    /*
     * The message is the model's own doing, in its own words where possible —
     * "the model returned an empty reply", "it spent 4,000 characters on
     * reasoning and stopped", "it stopped because it ran out of output budget".
     * "AI pass failed (The model did not return JSON.)" was true and useless.
     */
    warnings.push(
      `The AI pass did not produce a paper: ${(err as Error).message}. `
      + 'The rule-based reading was used instead — open the paper and check it. '
      + 'Platform → AI settings has a connection test if this keeps happening.',
    );
    return {
      content: ensureUniqueNumbers(rules.content, warnings), warnings, strategy: 'rules', usedAi: false,
      provider, ruleConfidence: rules.confidence,
    };
  }
}

/* ---------------------------- collections ------------------------------ */

export interface ParsedPaper {
  /** What the book called it: "Test 4". Empty for a single-paper upload. */
  label: string;
  /** 1-based position in the upload. */
  index: number;
  outcome: Omit<ParseOutcome, 'extracted'>;
}

export interface CollectionOutcome {
  /**
   * The papers, when the caller did not give a sink. With `onParsed` this is
   * empty on purpose — each paper was handed over and released as it was read.
   */
  papers: ParsedPaper[];
  /** How many papers were read this run, sink or no sink. */
  read: number;
  extracted: Extracted;
  /** True when the upload really was a collection of papers. */
  book: boolean;
  /** How many papers the upload holds in total, read or not. */
  total: number;
  /** Papers that were not reached before the run's time budget ran out. */
  remaining: number;
  warnings: string[];
}

export interface CollectionOptions extends Omit<TextParseOptions, 'fallbackTitle' | 'warnings'> {
  /** The answer-key file's text, when one was uploaded alongside the paper. */
  keyText?: string;
  /** Skip this many papers: a run that was cut short continues from here. */
  startAt?: number;
  /** Stop and report what is left once this many milliseconds have passed. */
  budgetMs?: number;
  /** Called as each paper is finished, so the console can show progress. */
  onPaper?: (done: number, total: number, label: string) => void | Promise<void>;
  /**
   * Called with a note the moment it is made.
   *
   * Everything a run has to say used to arrive when the run *finished* — so an
   * eighty-four-paper book spent twenty minutes showing "no printed answer key
   * was found" from the first paper while the line saying the key had been cut
   * off page 178 and shared out sat in a variable nobody could see. Notes about
   * the upload as a whole go through here as they happen.
   */
  onNote?: (line: string) => void | Promise<void>;
  /**
   * The operator ticked "this upload is a whole book". Then one paper is a
   * failure rather than an answer: the splitter walks every rule it has,
   * ending in blind chunking, rather than handing back four hundred questions
   * in a single paper.
   */
  forceBook?: boolean;
  /** Cut on whole tests, on exercises, or work it out (the default). */
  grain?: Grain;
  /**
   * Called with each paper the moment it is read, so the caller can save it and
   * let it go. A book read without this is held in memory *entire* — every
   * paper's questions, options and passages, plus the text they came from —
   * until the last page is done, which on a heavy book is how one upload takes
   * the whole site down with it. With a sink, one paper is in memory at a time
   * and each is already saved when the run is cut short.
   */
  onParsed?: (paper: ParsedPaper) => void | Promise<void>;
  /**
   * The text of the upload, already extracted on an earlier run. A book that
   * pauses on its time budget is continued from this rather than from the
   * original file — the file may be gone (retention, a storage outage, a
   * bucket that never took it), and losing the other three hundred papers
   * because the .docx cannot be fetched again is not an acceptable answer.
   */
  pretext?: string;
  /** Called once the upload has been read, so the caller can keep the text. */
  onExtracted?: (text: string) => void | Promise<void>;
  /**
   * The page the printed answers start on, when the operator knows it. A page
   * number is the one thing about a PDF a teacher can always tell you and no
   * parser can reliably guess — a key with no heading, or one headed with a
   * word nobody thought of, is invisible otherwise.
   */
  keyFromPage?: number;
  /**
   * Read the key with the model *before* reading the paper, and hand the paper
   * pass the answers it found. Costs one extra call per paper and is worth it:
   * a model that has the printed answers in front of it stops inventing them.
   */
  keyFirst?: boolean;
  /**
   * "Keep this as one paper": do not look for papers inside it at all. A paper
   * with four parts and three question types is still one paper if that is how
   * the centre sat it.
   */
  whole?: boolean;
}

/** Hands the event loop back, so a long read does not freeze every other request. */
export function breathe(): Promise<void> {
  return new Promise((resolve) => { setImmediate(resolve); });
}

/**
 * Reads an upload that may be a whole book.
 *
 * A book is cut into its papers first and each one is read on its own — a
 * single model call per paper at most, never one call for the book. That is the
 * difference between a job that finishes and a job that fails: the reply for
 * one paper is long, the reply for twenty is impossible.
 *
 * A single-paper upload comes back as one paper, so callers treat both alike.
 */
export async function parseCollection(
  filename: string,
  mime: string,
  buffer: Buffer,
  opts: CollectionOptions = {},
): Promise<CollectionOutcome> {
  const asImage = looksLikeImage(filename, mime);
  opts.onStage?.('extracting');
  const extracted = opts.pretext !== undefined
    ? { text: opts.pretext, warnings: [] as string[] }
    : asImage
      ? { text: '', warnings: [] as string[] }
      : await extractFile(filename, mime, buffer);
  if (opts.pretext === undefined && extracted.text) await opts.onExtracted?.(extracted.text);
  const warnings = [...extracted.warnings];
  const baseTitle = opts.title || filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

  // Photographs and scans go to the vision provider, which reads the pages it
  // is given. Cutting a book up by its headings needs a text layer, so a
  // scanned book is read as one paper and the operator is told why.
  const scanned = asImage || looksScanned(extracted.text, extracted.pages ?? 1);
  if (scanned && opts.strategy !== 'rules') {
    const vision = await visionParse(filename, mime, buffer, { ...opts, title: baseTitle }, warnings);
    if (vision) {
      if (opts.onParsed) await opts.onParsed({ label: '', index: 1, outcome: vision });
      return {
        papers: opts.onParsed ? [] : [{ label: '', index: 1, outcome: vision }],
        read: 1,
        extracted, book: false, total: 1, remaining: 0, warnings,
      };
    }
    if (asImage) {
      throw new Error(
        'This paper is an image, so it needs a vision provider. Set one up under '
        + 'Platform → AI settings ("Reading photographs and scans").',
      );
    }
    warnings.push('The PDF has almost no text in it, which usually means a scan. No vision provider is configured, so the rule parser read what little text there was.');
  }

  /*
   * A ceiling on the sheer size of the thing. Not to be clever about memory —
   * to fail *loudly* on a 4,000-page scan rather than quietly chewing the
   * server for twenty minutes. A real book is well under this.
   */
  const MAX_BOOK_CHARS = 4_000_000;
  if (extracted.text.length > MAX_BOOK_CHARS) {
    warnings.push(
      `This file holds ${Math.round(extracted.text.length / 1000).toLocaleString()},000 characters — `
      + `far more than a book. Only the first ${MAX_BOOK_CHARS / 1_000_000} million were read. `
      + 'If it really is one volume, split it and upload the parts.',
    );
    extracted.text = extracted.text.slice(0, MAX_BOOK_CHARS);
  }

  /*
   * "The answers start on page 50." Cut there, exactly, and use what follows as
   * the key for the whole upload — no heading to find, no grid to recognise.
   */
  /** Says it now, not when the book finishes. */
  const say = async (line: string) => {
    warnings.push(line);
    await opts.onNote?.(line);
  };

  let pageKey = '';
  if (opts.keyFromPage && opts.keyFromPage > 1) {
    const pages = extracted.pageTexts;
    if (!pages?.length) {
      await say(
        'A page number was given for the answer key, but this file has no pages to count '
        + '(only a PDF does). The key was looked for by its heading instead.',
      );
    } else if (opts.keyFromPage > pages.length) {
      await say(
        `The answer key was said to start on page ${opts.keyFromPage}, but this file has only `
        + `${pages.length}. The key was looked for by its heading instead.`,
      );
    } else {
      const from = opts.keyFromPage - 1;
      pageKey = pages.slice(from).join('\n\n').trim();
      extracted.text = pages.slice(0, from).join('\n\n');
      await say(
        `The answers were taken from page ${opts.keyFromPage} onwards, as told: `
        + `${pages.length - from} page(s) of key, ${from} of paper — `
        + `${keyEntries(pageKey).length} answer(s) read from them.`,
      );
    }
  }

  await breathe();
  opts.onStage?.('segmenting');
  const segments: BookSegment[] = opts.whole
    ? [{ title: '', text: extracted.text, index: 1, number: 1, by: 'test' as const }]
    : segmentBook(extracted.text, { force: opts.forceBook, grain: opts.grain });
  // A key cut off by page number belongs to whatever the body turns out to be.
  if (pageKey) {
    if (segments.length === 1) {
      segments[0].keyText = pageKey;
      await say('The answers from that page were given to the paper.');
    } else {
      const shared = shareOutKey(segments, pageKey, segments[0].by, { trusted: true });
      await say(shared
        ? `Those answers were shared out between ${shared} of the ${segments.length} papers in the upload.`
        : 'Those answers could not be matched to the papers in this upload — neither their headings '
          + 'nor their numbering line up with the key, and answers filed against the wrong questions '
          + 'are worse than none. The papers were saved without a key.');
    }
  }
  const book = segments.length > 1;
  await breathe();

  if (opts.forceBook && !book) {
    warnings.push(
      'This was uploaded as a whole book, but no way of cutting it into papers could be found — '
      + 'no "Test 1" or "Part 5" headings, no numbering that starts over, and not enough text to '
      + 'cut by length. It was read as one paper. If the headings are pictures rather than text, '
      + 'a vision provider will read them.',
    );
  }

  if (!book) {
    const outcome = await parseText(extracted.text, {
      ...opts,
      keyText: segments[0].keyText ?? opts.keyText,
      fallbackTitle: baseTitle,
      warnings,
    });
    if (opts.onParsed) {
      await opts.onParsed({ label: '', index: 1, outcome });
      return { papers: [], read: 1, extracted, book: false, total: 1, remaining: 0, warnings };
    }
    return { papers: [{ label: '', index: 1, outcome }], read: 1, extracted, book: false, total: 1, remaining: 0, warnings };
  }

  /*
   * A book's answer key is one file for every test in it, so it is cut up the
   * same way and each test is given its own block. Question 3 of Test 7 is not
   * question 3 of Test 1, so a key that cannot be cut up is not applied at all
   * — the operator is told rather than being given the wrong answers.
   */
  if (opts.keyText) {
    const shared = shareOutKey(segments, opts.keyText, segments[0].by);
    if (shared) {
      warnings.push(`The answer-key file was cut up and matched to ${shared} of the ${segments.length} papers in this book.`);
    } else {
      warnings.push(
        'The answer-key file could not be matched to the individual papers in this book — its '
        + 'headings and its numbering do not line up with theirs — so it was left out rather than '
        + 'filed against the wrong paper. Upload each paper\'s key with that paper instead.',
      );
    }
  }

  // The key printed at the back of the book itself is shared out in segmentBook.
  const fromBook = segments.filter((segment) => segment.keyText).length;
  if (fromBook && !opts.keyText) {
    warnings.push(
      `The answers printed at the back of the book were matched to ${fromBook} of the `
      + `${segments.length} papers in it, so those papers keep their printed key.`,
    );
  }

  /*
   * A book with answers at the back where a paper still ended up without them.
   * The paper's own note says "no printed answer key was found", which is true
   * of that paper and misleading about the book — so the book says its part.
   */
  const withKey = segments.filter((segment) => segment.keyText).length;
  if (findKeyRegion(extracted.text) >= 0 && withKey < segments.length) {
    warnings.push(
      withKey === 0
        ? 'This book prints answers at the back, but they could not be matched to the individual '
          + 'papers — the numbering in the key does not line up with the papers, and guessing would '
          + 'file the wrong answers against the wrong questions. The papers were saved without a key.'
        : `The answers at the back were matched to ${withKey} of the ${segments.length} papers; the `
          + 'rest were saved without a key.',
    );
  }

  const CUT_BY: Record<string, string> = {
    test: 'the test headings printed in it',
    exercise: 'the exercise headings printed in it ("Part 5", "Exercise 12", "Bài 3")',
    restart: 'the question numbering, which starts again at 1 at each new exercise',
    chunk: 'length, because it prints no headings at all — check where the papers begin and end',
  };
  warnings.push(
    `This upload is a collection of ${segments.length} papers (${segments.slice(0, 4).map((x) => x.title).join(', ')}`
    + `${segments.length > 4 ? ', …' : ''}), cut on ${CUT_BY[segments[0].by] ?? 'its headings'}. `
    + 'Each one is read on its own and saved as its own paper.',
  );

  const started = Date.now();
  /** Notes seen from more than one paper, so they are said once. */
  const repeated = new Map<string, number>();
  const papers: ParsedPaper[] = [];
  const todo = segments.slice(opts.startAt ?? 0);
  let stoppedAt = todo.length;
  /** Papers read this run, whether they were kept here or handed to the sink. */
  let read = 0;

  for (const [i, segment] of todo.entries()) {
    // A book takes longer than one serverless invocation is given. Rather than
    // die half-way and lose everything, the run stops on the budget and says
    // how many papers are left; the sweep picks the job up and carries on.
    if (opts.budgetMs && i > 0 && Date.now() - started > opts.budgetMs) {
      stoppedAt = i;
      break;
    }
    const label = segment.title || `Paper ${segment.index}`;
    opts.onPaper?.((opts.startAt ?? 0) + i, segments.length, label);
    /*
     * Node runs one thing at a time. Reading a paper with the rule parser does
     * no waiting at all, so forty of them in a row is one long block during
     * which nothing else — no login, no autosave, no page — is served. One
     * yield per paper costs nothing and keeps the site answering.
     */
    await breathe();
    const pieceWarnings: string[] = [];
    try {
      const outcome = await parseText(segment.text, {
        ...opts,
        keyText: segment.keyText ?? (segments.length === 1 ? opts.keyText : undefined),
        // The operator's title names the book, so each paper is the book plus
        // what the book calls it: "Cambridge IELTS 15 — Test 4".
        title: undefined,
        fallbackTitle: `${baseTitle} — ${label}`,
        warnings: pieceWarnings,
      });
      const parsed: ParsedPaper = { label, index: segment.index, outcome };
      /*
       * A book of a hundred papers says "this paper is not IELTS, so it is
       * marked in points" a hundred times. Only the first one carries a
       * paper's name; the rest are counted and summed up at the end. (Doing
       * this here rather than downstream is the only place where the label and
       * the note are still separate — a paper called "PART 5: INCOMPLETE
       * SENTENCES (2)" has a colon in its own name, so no amount of unpicking
       * the prefixed string afterwards is reliable.)
       */
      for (const line of pieceWarnings) {
        const before = repeated.get(line) ?? 0;
        repeated.set(line, before + 1);
        if (!before) warnings.push(`${label}: ${line}`);
      }
      if (opts.onParsed) await opts.onParsed(parsed);
      else papers.push(parsed);
      read += 1;
    } catch (err) {
      warnings.push(`${label} could not be read (${(err as Error).message}), so it was skipped.`);
    }
    await opts.onPaper?.((opts.startAt ?? 0) + i + 1, segments.length, label);
  }

  const alsoElsewhere = [...repeated.values()].filter((n) => n > 1).length;
  if (alsoElsewhere) {
    warnings.push(
      `${alsoElsewhere} of the notes above came up on more than one paper — they are listed once, `
      + 'against the first paper they applied to.',
    );
  }

  return {
    papers,
    read,
    extracted,
    book: true,
    total: segments.length,
    remaining: Math.max(0, todo.length - stoppedAt),
    warnings,
  };
}

export { configuredProvider };
