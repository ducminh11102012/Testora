/**
 * The checks that need a database and nothing else.
 *
 * These exist because of a specific class of mistake: SQL is a string, so a
 * statement whose column list and parameter list have drifted apart type-checks
 * perfectly and fails only when it runs. The same goes for a column that was
 * added to the schema but not to an INSERT, an index over a column that does
 * not exist yet, and a query that quietly returns nothing because a filter now
 * reads a different column.
 *
 * So every write path is exercised once, against a real Postgres, and the rows
 * are cleaned up afterwards. Run with `npm run verify:data`; needs
 * DATABASE_URL, and it will happily use a scratch database.
 */

import { check, equal, near, report, suite } from './harness';
import {
  accessCodes, attempts, databaseReady, events, imports, markings, orgs, paperStats, run, suites,
  tests, users, suiteSettingsOf,
} from '../../src/lib/db';
import { hashPassword } from '../../src/lib/password';

const STAMP = `verify-${Date.now().toString(36)}`;

async function main(): Promise<void> {
  const ready = await databaseReady();
  if (!ready.ok) {
    process.stdout.write(
      `No database to check against (${ready.reason}). Set DATABASE_URL and run this again;\n`
      + '`npm run verify` covers everything that needs nothing.\n',
    );
    process.exit(0);
  }

  /* ------------------------------ an organisation ------------------------ */

  suite('Writing and reading back');

  const org = await orgs.create({ slug: `${STAMP}-school`, name: 'Verification School', kind: 'tenant' });
  check('an organisation can be created', !!org.id);

  const staff = await users.create({
    username: `${STAMP}-owner`,
    email: `${STAMP}-owner@example.test`,
    passwordHash: await hashPassword('verify-1234'),
    displayName: 'Verification Owner',
  });
  const candidate = await users.create({
    username: `${STAMP}-candidate`,
    email: `${STAMP}-candidate@example.test`,
    passwordHash: await hashPassword('verify-1234'),
    displayName: 'Verification Candidate',
    credits: 3,
  });
  check('accounts can be created', !!staff.id && !!candidate.id);

  /* --------------------------------- a paper ----------------------------- */

  const content = {
    title: 'Verification paper',
    module: 'reading',
    variant: 'academic',
    durationMinutes: 30,
    description: 'A paper written by the verification suite.',
    audioUrl: '/tape.mp3',
    markingNotes: 'Mark the essay out of 9.',
    parts: [{
      id: 'p1',
      title: 'Part 1',
      instructions: 'Answer.',
      listening: true,
      groups: [{
        id: 'g1',
        type: 'multiple-choice',
        heading: 'Questions 1-2',
        questions: [
          { id: 'q1', number: 1, prompt: 'One?', options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }], answers: ['A'] },
          { id: 'q2', number: 2, prompt: 'Two?', options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }], answers: ['B'] },
        ],
      }],
    }],
  };

  const paper = await tests.create({
    orgId: org.id,
    title: content.title,
    module: 'reading',
    variant: 'academic',
    status: 'published',
    durationMin: 30,
    content: JSON.stringify(content),
    bank: true,
    folder: 'Verification',
    source: 'verification',
    visibility: 'suite',
  });
  check('a paper can be created', !!paper.id);

  const stats = paperStats(JSON.stringify(content));
  equal('the question count is worked out on write', stats.questionCount, 2);
  equal('the recording is noticed', stats.hasAudio, 1);

  const meta = (await tests.listOrgMeta(org.id)).find((row) => row.id === paper.id);
  equal('the count is stored on the row', meta?.questionCount, 2);
  equal('and so is the recording flag', meta?.hasAudio, 1);
  equal('and the description', meta?.summary, content.description);
  check('the metadata query carries no paper body', meta !== undefined && !('content' in (meta as object)));

  const counted = (await tests.listOrgWithCounts(org.id)).find((row) => row.id === paper.id);
  equal('attempt counts come back with the list', Number(counted?.attemptCount ?? -1), 0);

  const banked = await tests.bank(org.id);
  check('a bank paper is in the bank', banked.some((row) => row.id === paper.id));

  /* ------------------------- editing recounts the paper ------------------ */

  const shorter = { ...content, parts: [{ ...content.parts[0], groups: [{ ...content.parts[0].groups[0], questions: content.parts[0].groups[0].questions.slice(0, 1) }] }] };
  await tests.update(paper.id, { content: JSON.stringify(shorter) });
  const recounted = await tests.byId(paper.id);
  equal('editing a paper recounts its questions', recounted?.questionCount, 1);

  await tests.update(paper.id, { content: JSON.stringify(content) });

  /* -------------------------------- a full test -------------------------- */

  suite('Full tests');

  const suiteRow = await suites.create({
    orgId: org.id,
    title: 'Verification full test',
    items: [{ skill: 'reading', testId: paper.id, durationMin: 30, mode: 'online' }],
    status: 'published',
    visibility: 'private',
    folder: 'Verification',
    settings: { allowPractice: true, allowSimulation: true, practiceMaxMinutes: 45 },
  });
  check('a full test can be created', !!suiteRow.id);
  equal('its settings come back', suiteSettingsOf(suiteRow).practiceMaxMinutes, 45);
  equal('it is nobody in particular’s', suiteRow.assembledFor, null);

  const personal = await suites.create({
    orgId: org.id,
    title: 'Drawn for one candidate',
    items: [{ skill: 'reading', testId: paper.id, durationMin: 30, mode: 'online' }],
    status: 'published',
    visibility: 'private',
    settings: { assembledFor: candidate.id },
  });
  equal('a personal test records who for', personal.assembledFor, candidate.id);
  const theirs = await suites.assembledFor(candidate.id);
  check('and can be found by that', theirs.some((row) => row.id === personal.id));
  const listed = await suites.publishedOrg(org.id, candidate.id);
  check('the candidate sees both', listed.length === 2, `${listed.length} tests`);
  const others = await suites.publishedOrg(org.id, staff.id);
  check('somebody else does not see the personal one', !others.some((row) => row.id === personal.id));

  /* --------------------------------- attempts ---------------------------- */

  suite('Attempts');

  const attempt = await attempts.create({
    orgId: org.id,
    testId: paper.id,
    userId: candidate.id,
    endsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    suiteId: suiteRow.id,
    skill: 'reading',
    mode: 'practice',
  });
  check('an attempt can be created', !!attempt.id);
  equal('practice is recorded as practice', attempt.mode, 'practice');

  const guard = await attempts.guard(attempt.id);
  equal('the light read finds it', guard?.id, attempt.id);
  check('and carries no paper', guard !== null && !('testContent' in (guard as object)));

  const full = await attempts.byId(attempt.id);
  check('the full read carries the paper', !!full?.testContent);

  await attempts.update(attempt.id, { answers: JSON.stringify({ q1: 'A' }), rawScore: 1.5, manualScore: 0.5 });
  const scored = await attempts.byId(attempt.id);
  near('a fractional mark survives the round trip', (scored?.rawScore ?? 0) + (scored?.manualScore ?? 0), 2);

  await events.add(attempt.id, 'audio-start', { key: 'paper' });
  await events.add(attempt.id, 'focus-lost', {});
  equal('one kind of event can be asked for', (await events.ofType(attempt.id, 'audio-start')).length, 1);
  equal('the whole trail is still there', (await events.list(attempt.id)).length, 2);
  equal('and it can be counted per sitting', (await events.countByType(attempt.id)).length, 2);

  const finished = await attempts.finished(org.id);
  check('an unfinished attempt is not in the report', !finished.some((row) => row.id === attempt.id));

  await markings.save({
    attemptId: attempt.id,
    questionId: 'q1',
    markerId: staff.id,
    rubricId: null,
    scores: JSON.stringify({ task: 7 }),
    comment: 'Fine.',
    awarded: 7,
  });
  equal('a mark can be saved and read', (await markings.forAttempt(attempt.id)).length, 1);

  /* ----------------------- money, counted exactly once ------------------- */

  suite('Credits and codes');

  const before = (await users.byId(candidate.id))?.credits ?? 0;
  const spent = await users.spendCredits(candidate.id, 2);
  equal('a spend takes exactly what it says', spent?.credits, before - 2);
  const overdrawn = await users.spendCredits(candidate.id, 99);
  check('a spend beyond the balance is refused', overdrawn === null);
  equal('and takes nothing', (await users.byId(candidate.id))?.credits, before - 2);
  await users.addCredits(candidate.id, 2);
  equal('a refund puts it back', (await users.byId(candidate.id))?.credits, before);
  await users.addCredits(candidate.id, -9999);
  equal('a balance cannot go negative', (await users.byId(candidate.id))?.credits, 0);

  const code = await accessCodes.create({ orgId: org.id, credits: 1, maxUses: 1, code: `${STAMP}-CODE`.toUpperCase() });
  const first = await accessCodes.claim(code.id);
  const second = await accessCodes.claim(code.id);
  check('a one-use code is claimed once', first && !second);

  const fresh = await Promise.all([1, 2, 3].map((n) => accessCodes.create({
    orgId: org.id, credits: 1, maxUses: 1, code: `${STAMP}-R${n}`.toUpperCase(),
  })));
  const claimed = await Promise.all(fresh.map((row) => accessCodes.claim(row.id)));
  check('and each fresh code is claimable', claimed.every(Boolean));

  /* ------------------------- one import, one worker --------------------- */

  suite('Import jobs');

  const job = await imports.create({
    orgId: org.id,
    userId: staff.id,
    filename: 'verification.txt',
    mimeType: 'text/plain',
    sizeBytes: 10,
    strategy: 'rules',
    options: { strategy: 'rules' },
  });
  check('an import job can be created', !!job.id);
  const claims = await Promise.all([imports.claim(job.id), imports.claim(job.id), imports.claim(job.id)]);
  equal('only one worker can claim it', claims.filter(Boolean).length, 1);
  await imports.update(job.id, { status: 'queued', claimedAt: null, progress: JSON.stringify({ done: 1, total: 4 }) });
  check('a released job is claimable again', !!await imports.claim(job.id));
  check('a part-finished book is offered for continuing',
    (await imports.partial(5)).every((row) => row.status === 'queued'));

  /*
   * The projections. These are column lists in a string: naming a column the
   * table does not have typechecks perfectly and fails at run time — which is
   * exactly what happened when the import list stopped reading the megabyte of
   * book text it never needed and got one of the column names wrong.
   */
  await imports.update(job.id, { extractedText: 'x'.repeat(5_000) });
  const jobList = await imports.listOrg(org.id, 5);
  check('the import list reads back', jobList.some((row) => row.id === job.id));
  check('and carries no book text with it',
    !Object.prototype.hasOwnProperty.call(jobList[0] ?? {}, 'extractedText'));
  const jobMeta = await imports.metaById(job.id);
  equal('one import reads back by id, without its text', jobMeta?.filename, 'verification.txt');
  const jobFull = await imports.byId(job.id);
  equal('and the whole row still has the text when it is wanted', jobFull?.extractedText?.length, 5_000);
  const flight = await imports.inFlight(org.id, 'verification.txt', 10);
  check('the same file being read is found before a second run starts', !!flight);
  check('a file nobody is reading is not', !await imports.inFlight(org.id, 'nothing.txt', 10));

  /* --------------------------------- clean up ---------------------------- */

  suite('Cleaning up');

  await suites.remove(personal.id);
  await suites.remove(suiteRow.id);
  await imports.remove(job.id);
  await tests.remove(paper.id);
  await orgs.remove(org.id);
  check('the paper went with the organisation', !await tests.byId(paper.id));
  check('and so did the attempt', !await attempts.byId(attempt.id));
  // The codes belonged to the organisation, so they went with it; the accounts
  // are platform-wide and are removed by hand.
  await run('DELETE FROM users WHERE id IN (?, ?)', staff.id, candidate.id);
  check('the accounts are gone', !await users.byId(candidate.id));

  report();
}

void main();
