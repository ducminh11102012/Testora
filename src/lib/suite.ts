import {
  AttemptWithRefs, SkillName, SuiteItem, SuiteRow, attempts, markings, suiteResults, suites, tests,
} from './db';
import { roundBand, rawToBand, tableFor } from './bands';
import {
  ExamContent, FAMILY_OF, marksAvailable, reportedTotal, scoringOf,
} from '@/types/exam';
import { RubricCriterion } from '@/types/db';

export interface SkillProgress {
  skill: SkillName;
  item: SuiteItem;
  testTitle: string | null;
  attempt: AttemptWithRefs | null;
  /** A rehearsal of this section still running, if there is one. */
  practice: AttemptWithRefs | null;
  /**
   * The last rehearsal that was handed in. The hub shows it so a practice run
   * leaves something behind: a candidate who practises, submits and is handed
   * back a screen with no trace of it assumes the run was lost.
   */
  practiceDone: AttemptWithRefs | null;
  status: 'not-started' | 'in-progress' | 'submitted' | 'marked';
  band: number | null;
  /** Filled in by a member of staff for a skill sat off the platform. */
  manual: boolean;
}

export interface SuiteProgress {
  suite: SuiteRow;
  skills: SkillProgress[];
  complete: boolean;
  /** The overall band, for a full test made of IELTS papers. */
  overall: number | null;
  /**
   * A full test whose papers are marked in points reports a mark, not a band:
   * marks earned, marks available, and the total the papers are printed out of.
   */
  points: { awarded: number; available: number; total: number } | null;
  scoring: 'band' | 'points';
  released: boolean;
}

/**
 * Turns a writing attempt's marks into a band. When the rubric is already on a
 * nine-point scale the criterion mean is the band; otherwise the proportion of
 * the marks available is scaled onto it.
 */
export async function writingBand(attempt: AttemptWithRefs, content: ExamContent, criteria: RubricCriterion[]): Promise<number | null> {
  const rows = await markings.forAttempt(attempt.id);
  if (!rows.length) return null;

  const ninePoint = criteria.length > 0 && criteria.every((c) => c.max === 9);
  if (ninePoint) {
    const means = rows.map((row) => {
      const scores = JSON.parse(row.scores) as Record<string, number>;
      const values = criteria.map((c) => scores[c.key]).filter((v) => typeof v === 'number');
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }).filter((v): v is number => v !== null);
    // No criterion scores at all — an empty response, or a marker who typed a
    // total and nothing else. Fall through to the proportional route rather
    // than reporting no band, which reads as "not marked yet".
    if (means.length) return roundBand(means.reduce((a, b) => a + b, 0) / means.length);
  }

  const possible = content.parts.flatMap((p) => p.groups)
    .filter((g) => FAMILY_OF[g.type] === 'essay')
    .flatMap((g) => g.questions)
    .reduce((sum, q) => sum + (q.points ?? 1), 0);
  if (!possible) return null;
  const awarded = rows.reduce((sum, r) => sum + r.awarded, 0);
  return roundBand((awarded / possible) * 9);
}

export async function bandForAttempt(attempt: AttemptWithRefs, skill: SkillName, criteria: RubricCriterion[]): Promise<number | null> {
  if (attempt.status === 'in_progress') return null;
  const content = JSON.parse(attempt.testContent) as ExamContent;

  // A paper marked in points has no band, and inventing one out of the
  // percentage would be a number nobody asked for.
  if (scoringOf(content) === 'points') return null;
  if (skill === 'writing') return writingBand(attempt, content, criteria);
  if (attempt.band !== null) return attempt.band;
  if (attempt.rawScore === null) return null;
  return rawToBand(attempt.rawScore, tableFor(skill, content.variant));
}

export async function suiteProgress(
  suite: SuiteRow,
  userId: string,
  criteria: RubricCriterion[] = [],
  /**
   * The candidate's attempts, when the caller has already read them. A roster
   * screen reads the whole suite's attempts in one query and then asks for each
   * candidate's progress; without this it would read them again per candidate.
   */
  known?: AttemptWithRefs[],
): Promise<SuiteProgress> {
  const items = suites.itemsOf(suite);
  const everything = known ?? await attempts.listForSuite(suite.id, userId);
  /*
   * Practice is the candidate's own rehearsal and never counts: it would
   * otherwise mark a section as done, block the real attempt, and put a
   * rehearsal score in the test's report.
   */
  const mine = everything.filter((a) => a.mode !== 'practice');
  // Newest first: a candidate who has practised a section five times means the
  // fifth, not the first.
  const rehearsals = everything.filter((a) => a.mode === 'practice').reverse();
  const stored = await suiteResults.find(suite.id, userId);
  const manualBands: Record<string, number> = stored ? JSON.parse(stored.manualBands) : {};

  // The section titles in one query rather than one paper read per section —
  // and the papers themselves are already attached to the attempts.
  const titles = new Map(
    (await tests.titlesOf(items.map((i) => i.testId).filter((id): id is string => !!id)))
      .map((row) => [row.id, row.title]),
  );

  const skills: SkillProgress[] = await Promise.all(items.map(async (item): Promise<SkillProgress> => {
    if (item.mode === 'offline') {
      const band = manualBands[item.skill] ?? null;
      return {
        skill: item.skill, item, testTitle: null, attempt: null, practice: null, practiceDone: null,
        manual: true,
        status: band === null ? 'not-started' : 'marked', band,
      };
    }

    const attempt = mine.find((a) => a.skill === item.skill) ?? null;
    const practice = rehearsals.find((a) => a.skill === item.skill && a.status === 'in_progress') ?? null;
    const practiceDone = rehearsals.find((a) => a.skill === item.skill && a.status !== 'in_progress') ?? null;
    const testTitle = item.testId ? titles.get(item.testId) ?? null : null;
    if (!attempt) {
      return {
        skill: item.skill, item, testTitle, attempt: null, practice, practiceDone,
        manual: false, status: 'not-started', band: null,
      };
    }
    const band = await bandForAttempt(attempt, item.skill, criteria) ?? manualBands[item.skill] ?? null;
    const status = attempt.status === 'in_progress' ? 'in-progress'
      : attempt.status === 'marked' || band !== null ? 'marked' : 'submitted';
    return { skill: item.skill, item, testTitle, attempt, practice, practiceDone, manual: false, status, band };
  }));

  const online = skills.filter((s) => !s.manual);
  const complete = online.length > 0 && online.every((s) => s.status === 'submitted' || s.status === 'marked');
  // An overall band only means something once every section has one, so a
  // paper still waiting on the writing marker shows no overall figure.
  const bands = skills.map((s) => s.band);
  const overall = bands.length && bands.every((b): b is number => b !== null)
    ? roundBand(bands.reduce((a, b) => a + (b as number), 0) / bands.length)
    : null;

  /*
   * A full test built from a Vietnamese paper is reported the way that paper is
   * printed: marks out of its total, added up across the sections. Only a test
   * whose papers are all IELTS gets an overall band.
   */
  let scoring: 'band' | 'points' = 'band';
  let awarded = 0;
  let available = 0;
  let total = 0;
  for (const s of skills) {
    if (!s.attempt) continue;
    const content = JSON.parse(s.attempt.testContent) as ExamContent;
    if (scoringOf(content) === 'points') scoring = 'points';
    awarded += (s.attempt.rawScore ?? 0) + (s.attempt.manualScore ?? 0);
    available += marksAvailable(content);
    total += reportedTotal(content);
  }
  const points = scoring === 'points' && available > 0
    ? {
        awarded: Math.round(awarded * 100) / 100,
        available: Math.round(available * 100) / 100,
        total: Math.round(total * 10) / 10,
      }
    : null;

  return { suite, skills, complete, overall, points, scoring, released: !!stored?.releasedAt };
}
