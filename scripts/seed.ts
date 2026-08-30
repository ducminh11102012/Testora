/**
 * Creates the database, the platform tenant, a demo school, accounts and
 * sample papers. Safe to re-run: rows are updated rather than duplicated.
 */
import { accessCodes, memberships, orgs, rubrics, sittings, tests } from '../src/lib/db';
import { hashPassword } from '../src/lib/password';
import { users } from '../src/lib/db';
import { LISTENING_TEST, READING_TEST, WRITING_TEST } from './seed-content';
import { CHUYEN_ANH_PAPER } from './seed-chuyen';
import { ExamContent } from '../src/types/exam';
import { OrgRole, TestStatus } from '../src/types/db';

function ensureOrg(slug: string, name: string, kind: 'platform' | 'tenant', branding = {}) {
  return orgs.bySlug(slug) ?? orgs.create({ slug, name, kind, branding });
}

function ensureUser(input: {
  email: string; password: string; displayName: string;
  candidateRef?: string; isPlatformAdmin?: boolean; credits?: number;
}) {
  const existing = users.byEmail(input.email);
  if (existing) return existing;
  return users.create({
    email: input.email,
    username: input.email.split('@')[0],
    passwordHash: hashPassword(input.password),
    displayName: input.displayName,
    candidateRef: input.candidateRef ?? null,
    isPlatformAdmin: input.isPlatformAdmin,
    credits: input.credits ?? 0,
  });
}

function ensureTest(orgId: string, content: ExamContent, opts: {
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
  const existing = tests.byTitle(orgId, content.title);
  return existing ? tests.update(existing.id, payload)! : tests.create(payload);
}

/* ---------------------------------------------------------------- orgs */

const platform = ensureOrg('public', 'Examina', 'platform', {
  wordmark: 'Examina',
  tagline: 'Assessment platform',
});

const school = ensureOrg('chuyen-demo', 'Trường THPT Chuyên Demo', 'tenant', {
  wordmark: 'Chuyên Demo',
  tagline: 'Khảo thí tiếng Anh',
  primary: '#0E7C86',
  primaryDark: '#0A5C63',
  accent: '#C2410C',
  banner: '#EFF5F5',
  rail: '#CDE7E9',
  railTrack: '#F4FAFA',
});

/* --------------------------------------------------------------- people */

const admin = ensureUser({
  email: 'admin@examina.test', password: 'admin1234',
  displayName: 'Platform Administrator', isPlatformAdmin: true,
});
const principal = ensureUser({
  email: 'owner@chuyen.test', password: 'owner1234', displayName: 'Nguyễn Thị Hiệu Trưởng',
});
const teacher = ensureUser({
  email: 'teacher@chuyen.test', password: 'teach1234', displayName: 'Trần Văn Giáo',
});
const candidate = ensureUser({
  email: 'candidate@chuyen.test', password: 'test1234',
  displayName: 'Nguyễn Văn A', candidateRef: 'VN-0043128', credits: 2,
});
const learner = ensureUser({
  email: 'learner@examina.test', password: 'test1234', displayName: 'Lê Thị B', credits: 3,
});

const roles: [string, string, OrgRole, string | null][] = [
  [admin.id, platform.id, 'owner', null],
  [admin.id, school.id, 'admin', null],
  [principal.id, school.id, 'owner', null],
  [teacher.id, school.id, 'teacher', null],
  [candidate.id, school.id, 'candidate', '10A1'],
  [learner.id, platform.id, 'candidate', null],
];
for (const [userId, orgId, role, cohort] of roles) memberships.upsert(userId, orgId, role, cohort);

/* --------------------------------------------------------------- papers */

const reading = ensureTest(platform.id, READING_TEST, { status: 'published', visibility: 'catalog', priceCredits: 0 });
ensureTest(platform.id, WRITING_TEST, { status: 'published', visibility: 'catalog', priceCredits: 1 });
ensureTest(platform.id, LISTENING_TEST, { status: 'draft' });
const chuyen = ensureTest(school.id, CHUYEN_ANH_PAPER, { status: 'published' });

/* ------------------------------------------------------- sitting + codes */

if (!sittings.listOrg(school.id).length) {
  sittings.create({
    orgId: school.id,
    testId: chuyen.id,
    name: 'Khảo sát đội tuyển — lớp 10A1',
    accessCode: 'CHUYEN1',
    durationMin: 90,
    settings: { blockCopyPaste: true, trackFocusLoss: true, releaseResultsImmediately: false },
  });
}

if (!accessCodes.list(school.id).length) {
  for (let i = 0; i < 5; i++) {
    accessCodes.create({ orgId: school.id, credits: 1, maxUses: 1, note: 'Lớp 10A1' });
  }
}

if (!rubrics.listOrg(school.id).length) {
  rubrics.create({
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
console.log('  Platform admin   admin@examina.test      / admin1234');
console.log('  School owner     owner@chuyen.test       / owner1234');
console.log('  Teacher/marker   teacher@chuyen.test     / teach1234');
console.log('  School candidate candidate@chuyen.test   / test1234');
console.log('  Public learner   learner@examina.test    / test1234');
console.log('');
console.log(`  Sitting code     CHUYEN1  (${CHUYEN_ANH_PAPER.title})`);
console.log(`  Catalogue paper  ${reading.title}`);
