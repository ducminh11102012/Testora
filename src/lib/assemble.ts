/**
 * Building a full test out of the bank.
 *
 * A centre that has uploaded a book has forty papers and no tests. This turns
 * the bank into full tests: one paper per skill, drawn at random, in the order
 * they are sat. Staff draw a batch of them when they set up a sitting; a
 * candidate with nothing to sit draws one for themselves.
 */

import { SuiteItem, SuiteRow, SuiteSettings, suites, tests } from './db';
import { TestRow } from '@/types/db';
import { ExamContent, missingAudio } from '@/types/exam';

export type AssembleSkill = 'listening' | 'reading' | 'writing';

/** The order a full test is sat in. */
export const ASSEMBLE_ORDER: AssembleSkill[] = ['listening', 'reading', 'writing'];

const LABEL: Record<AssembleSkill, string> = {
  listening: 'Listening', reading: 'Reading', writing: 'Writing',
};

/**
 * The usual timings, used only when the paper itself states none. Zero
 * anywhere in the chain means the section is sat with no clock.
 */
const USUAL_MINUTES: Record<AssembleSkill, number> = { listening: 30, reading: 60, writing: 60 };

/**
 * A listening paper with no recording cannot be sat, so it is never drawn. The
 * check reads the paper because the recording lives inside its content.
 */
function sittable(row: TestRow): boolean {
  try {
    const content = JSON.parse(row.content) as ExamContent;
    if (!content.parts?.length) return false;
    return missingAudio(content).length === 0;
  } catch {
    return false;
  }
}

/** Which section of a full test a bank paper can serve as. */
function skillOf(row: TestRow): AssembleSkill {
  if (row.module === 'listening') return 'listening';
  if (row.module === 'writing') return 'writing';
  return 'reading';
}

/** Fisher–Yates, so every paper has the same chance of being drawn. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BankSummary {
  total: number;
  bySkill: Record<AssembleSkill, number>;
  /** The most full tests that could be built from what is there. */
  possible: number;
}

export async function bankSummary(orgId: string, skills = ASSEMBLE_ORDER): Promise<BankSummary> {
  const pool = (await tests.bank(orgId)).filter(sittable);
  const bySkill: Record<AssembleSkill, number> = { listening: 0, reading: 0, writing: 0 };
  for (const row of pool) bySkill[skillOf(row)] += 1;
  const wanted = skills.filter((s) => bySkill[s] > 0);
  const possible = wanted.length ? Math.min(...wanted.map((s) => bySkill[s])) : 0;
  return { total: pool.length, bySkill, possible };
}

export interface AssembleOptions {
  orgId: string;
  /** How many full tests to build. */
  count?: number;
  /** Which sections each test should have. Missing sections are skipped. */
  skills?: AssembleSkill[];
  /** "Mock exam" → "Mock exam 1", "Mock exam 2". */
  titlePrefix?: string;
  /** Put the finished tests in front of candidates. */
  publish?: boolean;
  /** `catalog` also lists them in the public catalogue. */
  visibility?: 'private' | 'catalog';
  /** Set for a test drawn for one candidate, so only they are offered it. */
  forUserId?: string | null;
  settings?: Partial<SuiteSettings>;
  /** The folder the finished tests are filed under. */
  folder?: string | null;
}

export interface AssembleResult {
  built: SuiteRow[];
  warnings: string[];
  summary: BankSummary;
}

/**
 * Draws full tests from the bank. Papers are used up as they are drawn, so a
 * batch of five tests is five different papers per skill wherever the bank is
 * deep enough; once a skill runs out the pool is reshuffled and reused rather
 * than leaving the test short of a section.
 */
export async function assembleSuites(opts: AssembleOptions): Promise<AssembleResult> {
  const skills = (opts.skills?.length ? opts.skills : ASSEMBLE_ORDER)
    .filter((s, i, list) => list.indexOf(s) === i);
  const count = Math.max(1, Math.min(20, Math.round(opts.count ?? 1)));
  const warnings: string[] = [];

  const pool = (await tests.bank(opts.orgId)).filter(sittable);
  const summary = await bankSummary(opts.orgId, skills);
  if (!pool.length) {
    return {
      built: [],
      warnings: ['There are no papers in the bank yet. Upload a book, or tick "add to the bank" when you import a paper.'],
      summary,
    };
  }

  // One bag per skill, drawn from and refilled when it empties.
  const bags = new Map<AssembleSkill, TestRow[]>();
  const refill = (skill: AssembleSkill) => {
    const forSkill = pool.filter((row) => skillOf(row) === skill);
    bags.set(skill, shuffled(forSkill));
    return forSkill.length;
  };
  for (const skill of skills) refill(skill);

  const missing = skills.filter((skill) => (bags.get(skill) ?? []).length === 0);
  if (missing.length) {
    warnings.push(
      `The bank has no ${missing.map((s) => LABEL[s].toLowerCase()).join(' or ')} paper, `
      + `so the tests were built without ${missing.length === 1 ? 'that section' : 'those sections'}.`,
    );
  }
  const usable = skills.filter((skill) => (bags.get(skill) ?? []).length > 0);
  if (!usable.length) {
    return { built: [], warnings: [...warnings, 'None of the bank papers can be sat yet.'], summary };
  }

  const built: SuiteRow[] = [];
  const stamp = new Date().toISOString();

  for (let n = 1; n <= count; n++) {
    const items: SuiteItem[] = [];
    const titles: string[] = [];

    for (const skill of ASSEMBLE_ORDER.filter((s) => usable.includes(s))) {
      let bag = bags.get(skill)!;
      if (!bag.length) { refill(skill); bag = bags.get(skill)!; }
      const paper = bag.pop();
      if (!paper) continue;
      items.push({
        skill,
        testId: paper.id,
        // The paper's own timing wins; the usual one is a fallback, and 0 in
        // the paper means the centre wants it sat with no clock.
        durationMin: paper.durationMin > 0 ? paper.durationMin : USUAL_MINUTES[skill],
        mode: 'online',
      });
      titles.push(paper.title);
    }

    if (!items.length) break;

    const prefix = opts.titlePrefix?.trim() || (opts.forUserId ? 'Your practice test' : 'Full test');
    const suite = await suites.create({
      orgId: opts.orgId,
      title: count > 1 ? `${prefix} ${n}` : prefix,
      kind: 'assembled',
      description: `Drawn from the bank: ${titles.join(' · ')}`,
      status: opts.publish === false ? 'draft' : 'published',
      visibility: opts.visibility ?? 'private',
      items,
      // A batch drawn together belongs together, so the candidate sees "Mock
      // exams" rather than five loose tests.
      folder: opts.folder ?? (count > 1 ? prefix : null),
      settings: {
        allowPractice: true,
        allowSimulation: true,
        practiceMaxMinutes: 0,
        assembledFor: opts.forUserId ?? null,
        assembledAt: stamp,
        ...(opts.settings ?? {}),
      },
    });
    built.push(suite);
  }

  return { built, warnings, summary };
}
