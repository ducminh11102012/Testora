/**
 * Creates the schema, the platform tenant, the community space, a demo school,
 * accounts and sample papers. Safe to re-run: rows are updated rather than
 * duplicated. Point DATABASE_URL at the database first.
 */
import {
  accessCodes, memberships, migrate, orgs, pool, rubrics, sittings, suites, tests, users,
} from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { LISTENING_TEST, READING_TEST, WRITING_TEST } from './seed-content';
import { CHUYEN_ANH_PAPER } from './seed-chuyen';
import { ExamContent } from '../src/types/exam';
import { OrgKind, OrgRole, TestStatus } from '../src/types/db';

async function ensureOrg(slug: string, name: string, kind: OrgKind, joinCode: string, branding = {}) {
  const existing = await orgs.bySlug(slug);
  if (existing) {
    if (!existing.joinCode) await orgs.update(existing.id, { joinCode });
    return (await orgs.bySlug(slug))!;
  }
  return orgs.create({ slug, name, kind, joinCode, branding });
}

async function ensureUser(input: {
  email: string; password: string; displayName: string;
  candidateRef?: string; isPlatformAdmin?: boolean; credits?: number;
}) {
  const existing = await users.byEmail(input.email);
  if (existing) return existing;
  // A deployment may already have an administrator called `admin` from the
  // first-run screen, so take the next free username rather than colliding.
  let username = input.email.split('@')[0];
  while (await users.byUsername(username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;
  return users.create({
    email: input.email,
    username,
    passwordHash: hashPassword(input.password),
    displayName: input.displayName,
    candidateRef: input.candidateRef ?? null,
    isPlatformAdmin: input.isPlatformAdmin,
    credits: input.credits ?? 0,
  });
}

async function ensureTest(orgId: string, content: ExamContent, opts: {
  status: TestStatus; visibility?: 'private' | 'catalog'; priceCredits?: number;
}) {
  const payload = {
    orgId,
    title: content.title,
    module: content.module,
    variant: content.variant ?? 'academic',
    durationMin: content.durationMinutes,
    status: opts.status,
    visibility: opts.visibility ?? 'private',
    priceCredits: opts.priceCredits ?? 0,
    content: JSON.stringify(content),
  };
  const existing = await tests.byTitle(orgId, content.title);
  return existing ? (await tests.update(existing.id, payload))! : tests.create(payload);
}

const SUITE_TITLE = 'IELTS Academic — practice test 1';

async function main() {
  await migrate();

  /* -------------------------------------------------------------- orgs */

  const platform = await ensureOrg('public', 'Testora', 'platform', 'TESTORA', {
    wordmark: 'Testora',
    tagline: 'Assessment platform',
  });

  // The open space the platform admin's code joins you to. Its bank is free to
  // every account; private papers still have to go through a tenant.
  const community = await ensureOrg('community', 'Testora Community', 'community', 'COMMON', {
    wordmark: 'Testora Community',
    tagline: 'Open practice',
  });

  const school = await ensureOrg('chuyen-demo', 'Trường THPT Chuyên Demo', 'tenant', 'CHUYEN', {
    wordmark: 'Chuyên Demo',
    tagline: 'Khảo thí tiếng Anh',
    primary: '#0E7C86',
    primaryDark: '#0A5C63',
    accent: '#C2410C',
    banner: '#EFF5F5',
    rail: '#CDE7E9',
    railTrack: '#F4FAFA',
  });

  /* ------------------------------------------------------------ people */

  const admin = await ensureUser({
    email: 'admin@testora.test', password: 'admin1234',
    displayName: 'Platform Administrator', isPlatformAdmin: true,
  });
  const principal = await ensureUser({
    email: 'owner@chuyen.test', password: 'owner1234', displayName: 'Nguyễn Thị Hiệu Trưởng',
  });
  const teacher = await ensureUser({
    email: 'teacher@chuyen.test', password: 'teach1234', displayName: 'Trần Văn Giáo',
  });
  const candidate = await ensureUser({
    email: 'candidate@chuyen.test', password: 'test1234',
    displayName: 'Nguyễn Văn A', candidateRef: 'VN-0043128', credits: 2,
  });
  const learner = await ensureUser({
    email: 'learner@testora.test', password: 'test1234', displayName: 'Lê Thị B', credits: 3,
  });

  const roles: [string, string, OrgRole, string | null][] = [
    [admin.id, platform.id, 'owner', null],
    [admin.id, community.id, 'owner', null],
    [admin.id, school.id, 'admin', null],
    [principal.id, school.id, 'owner', null],
    [teacher.id, school.id, 'teacher', null],
    [candidate.id, school.id, 'candidate', '10A1'],
    [learner.id, community.id, 'candidate', null],
    [learner.id, platform.id, 'candidate', null],
  ];
  for (const [userId, orgId, role, cohort] of roles) await memberships.upsert(userId, orgId, role, cohort);

  /* ------------------------------------------------------------ papers */

  // The free shared bank belongs to the community space, so the papers everyone
  // can sit and the marking they generate sit in one place. The platform tenant
  // is the administrator's own bank: private papers still go through an org.
  const reading = await ensureTest(community.id, READING_TEST, { status: 'published', visibility: 'catalog' });
  const writing = await ensureTest(community.id, WRITING_TEST, { status: 'published', visibility: 'catalog' });
  const listening = await ensureTest(community.id, LISTENING_TEST, { status: 'published', visibility: 'catalog' });
  const chuyen = await ensureTest(school.id, CHUYEN_ANH_PAPER, { status: 'published' });

  /* --------------------------------------------------- a full IELTS test */

  // Only IELTS papers are split by skill. Each skill is timed on its own, opens
  // with its instruction video, and counts separately towards the report.
  const suiteItems = [
    { skill: 'listening' as const, testId: listening.id, durationMin: 30,
      videoUrl: 'https://static.gelnet.org/cdielts/listening.mp4', mode: 'online' as const },
    { skill: 'reading' as const, testId: reading.id, durationMin: 60,
      videoUrl: 'https://static.gelnet.org/cdielts/reading.mp4', mode: 'online' as const },
    { skill: 'writing' as const, testId: writing.id, durationMin: 60,
      videoUrl: 'https://static.gelnet.org/cdielts/writing.mp4', mode: 'online' as const },
  ];
  const suitePayload = {
    title: SUITE_TITLE,
    kind: 'ielts',
    description: 'Listening, Reading and Writing sat separately. The report appears once all three are in.',
    status: 'published',
    visibility: 'catalog',
    priceCredits: 0,
    items: suiteItems,
  };
  const existingSuite = await suites.byTitle(community.id, SUITE_TITLE);
  if (existingSuite) {
    await suites.update(existingSuite.id, { ...suitePayload, items: JSON.stringify(suiteItems) });
  } else {
    await suites.create({ orgId: community.id, ...suitePayload });
  }

  /* --------------------------------------------------- sittings and codes */

  if (!(await sittings.listOrg(school.id)).length) {
    await sittings.create({
      orgId: school.id,
      testId: chuyen.id,
      name: 'Khảo sát đội tuyển — lớp 10A1',
      accessCode: 'CHUYEN1',
      durationMin: 90,
      settings: { blockCopyPaste: true, trackFocusLoss: true, releaseResultsImmediately: false },
    });
  }

  if (!(await accessCodes.list(school.id)).length) {
    for (let i = 0; i < 5; i++) {
      await accessCodes.create({ orgId: school.id, credits: 1, maxUses: 1, note: 'Lớp 10A1' });
    }
  }

  /* ----------------------------------------------------------- rubrics */

  // The community rubric is what the writing marker (a person, or the model)
  // scores against, and it is already on the nine-point scale.
  if (!(await rubrics.listOrg(community.id)).length) {
    await rubrics.create({
      orgId: community.id,
      name: 'IELTS Writing — nine-point',
      criteria: JSON.stringify([
        { key: 'task', label: 'Task achievement', max: 9, descriptors: 'Covers the task fully with a clear position and relevant support.' },
        { key: 'coherence', label: 'Coherence and cohesion', max: 9, descriptors: 'Logical progression, paragraphing, and cohesive devices used well.' },
        { key: 'lexical', label: 'Lexical resource', max: 9, descriptors: 'Range and precision of vocabulary, with natural collocation.' },
        { key: 'grammar', label: 'Grammatical range and accuracy', max: 9, descriptors: 'Range of structures, and accuracy under that range.' },
      ]),
    });
  }

  if (!(await rubrics.listOrg(school.id)).length) {
    await rubrics.create({
      orgId: school.id,
      name: 'Writing — 20 points',
      criteria: JSON.stringify([
        { key: 'task', label: 'Task response', max: 5, descriptors: 'Answers the question and develops a position.' },
        { key: 'organisation', label: 'Organisation', max: 5, descriptors: 'Clear progression and paragraphing.' },
        { key: 'language', label: 'Language use', max: 5, descriptors: 'Range and accuracy of grammar and vocabulary.' },
        { key: 'mechanics', label: 'Mechanics', max: 5, descriptors: 'Spelling, punctuation, register.' },
      ]),
    });
  }

  console.log('Seeded.');
  console.log('');
  console.log('  Platform admin   admin@testora.test      / admin1234');
  console.log('  School owner     owner@chuyen.test       / owner1234');
  console.log('  Teacher/marker   teacher@chuyen.test     / teach1234');
  console.log('  School candidate candidate@chuyen.test   / test1234');
  console.log('  Public learner   learner@testora.test    / test1234');
  console.log('');
  console.log(`  Sitting code     CHUYEN1  (${CHUYEN_ANH_PAPER.title})`);
  console.log(`  Catalogue paper  ${reading.title}`);
  console.log(`  Full IELTS test  ${SUITE_TITLE}`);
  console.log('');
  console.log('  Join codes       TESTORA (platform) · COMMON (community) · CHUYEN (demo school)');
}

main()
  .then(() => pool().end())
  .catch((err) => { console.error(err); pool().end(); process.exit(1); });
