/**
 * Data layer.
 *
 * PostgreSQL through the `pg` driver and a shared connection pool. Every query
 * in the product lives in this file, keeping the persistence boundary contained.
 *
 * Tenancy: one database, every row that belongs to a customer carries `orgId`,
 * and every query that reads customer data takes an orgId. The public B2C
 * catalogue is itself an organisation (`kind = 'platform'`).
 *
 */

import { Pool, type QueryResult, type QueryResultRow } from 'pg';
// deasync keeps the existing synchronous data-layer contract used by server components.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deasync = require('deasync') as { loopWhile(predicate: () => boolean): void };
import { randomUUID } from 'node:crypto';
import {
  AccessCodeRow, AttemptEventRow, AttemptRow, Branding, ExamSessionRow, ImportRow, MarkingRow,
  MembershipRow, OrderRow, OrgRole, OrgSettings, OrganizationRow, RubricRow, TestRow, UserRow,
} from '@/types/db';
import { DEFAULT_BRANDING, DEFAULT_ORG_SETTINGS, DEFAULT_SESSION_SETTINGS } from './defaults';

export { DEFAULT_BRANDING, DEFAULT_ORG_SETTINGS, DEFAULT_SESSION_SETTINGS };

// Server only. Values the browser also needs live in ./defaults so importing
// them never drags the PostgreSQL driver into a client bundle.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/db.ts was imported from the browser. Import from src/lib/defaults.ts instead.');
}

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/examina';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tenant',
  plan TEXT NOT NULL DEFAULT 'starter',
  branding TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  displayName TEXT NOT NULL,
  candidateRef TEXT,
  isPlatformAdmin INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'candidate',
  cohort TEXT,
  createdAt TEXT NOT NULL,
  UNIQUE (userId, orgId)
);
CREATE INDEX IF NOT EXISTS memberships_org ON memberships(orgId);

CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'reading',
  variant TEXT NOT NULL DEFAULT 'academic',
  status TEXT NOT NULL DEFAULT 'draft',
  durationMin INTEGER NOT NULL DEFAULT 60,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  priceCredits INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tests_org ON tests(orgId);

CREATE TABLE IF NOT EXISTS exam_sessions (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  testId TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  accessCode TEXT NOT NULL,
  opensAt TEXT,
  closesAt TEXT,
  durationMin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  settings TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_org ON exam_sessions(orgId);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_code ON exam_sessions(accessCode);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  testId TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  sessionId TEXT REFERENCES exam_sessions(id) ON DELETE SET NULL,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  startedAt TEXT NOT NULL,
  endsAt TEXT NOT NULL,
  submittedAt TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  annotations TEXT NOT NULL DEFAULT '[]',
  flags TEXT NOT NULL DEFAULT '[]',
  rawScore INTEGER,
  manualScore INTEGER,
  band REAL,
  report TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_user ON attempts(userId);
CREATE INDEX IF NOT EXISTS attempts_org ON attempts(orgId);
CREATE INDEX IF NOT EXISTS attempts_session ON attempts(sessionId);

CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS markings (
  id TEXT PRIMARY KEY,
  attemptId TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  questionId TEXT NOT NULL,
  markerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rubricId TEXT REFERENCES rubrics(id) ON DELETE SET NULL,
  scores TEXT NOT NULL DEFAULT '{}',
  comment TEXT NOT NULL DEFAULT '',
  awarded REAL NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  UNIQUE (attemptId, questionId)
);

CREATE TABLE IF NOT EXISTS access_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  orgId TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  testId TEXT REFERENCES tests(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0,
  maxUses INTEGER NOT NULL DEFAULT 1,
  usedCount INTEGER NOT NULL DEFAULT 0,
  expiresAt TEXT,
  note TEXT NOT NULL DEFAULT '',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  orgId TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amountMinor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'VND',
  credits INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'pending',
  reference TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempt_events (
  id TEXT PRIMARY KEY,
  attemptId TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_attempt ON attempt_events(attemptId);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  strategy TEXT NOT NULL DEFAULT 'hybrid',
  provider TEXT,
  extractedText TEXT,
  draft TEXT,
  warnings TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  testId TEXT REFERENCES tests(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __examinaPool?: Pool; __examinaReady?: boolean };

function pool(): Pool {
  if (!globalForDb.__examinaPool) {
    globalForDb.__examinaPool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5000),
    });
  }
  return globalForDb.__examinaPool;
}

function open(): Pool {
  if (!globalForDb.__examinaReady) {
    awaitSync(pool().query(SCHEMA));
    globalForDb.__examinaReady = true;
  }
  return pool();
}

export const db = { get pool() { return open(); } };

const now = () => new Date().toISOString();
const id = () => randomUUID();

function pg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function awaitSync<T>(promise: Promise<T>): T {
  let done = false;
  let result: T | undefined;
  let error: unknown;
  promise.then((value) => { result = value; }, (reason) => { error = reason; }).finally(() => { done = true; });
  deasync.loopWhile(() => !done);
  if (error) throw error;
  return result as T;
}

function query<T extends QueryResultRow = QueryResultRow>(sql: string, ...p: unknown[]): QueryResult<T> {
  return awaitSync(open().query<T>(pg(sql), p));
}
const CAMEL_KEYS: Record<string, string> = {
  createdat: 'createdAt', updatedat: 'updatedAt', passwordhash: 'passwordHash',
  candidateref: 'candidateRef', isplatformadmin: 'isPlatformAdmin', orgid: 'orgId',
  userid: 'userId', testid: 'testId', sessionid: 'sessionId', accescode: 'accessCode',
  accesscode: 'accessCode', opensat: 'opensAt', closesat: 'closesAt', durationmin: 'durationMin',
  startedat: 'startedAt', endsat: 'endsAt', submittedat: 'submittedAt', rawscore: 'rawScore',
  manualscore: 'manualScore', questionid: 'questionId', markerid: 'markerId', rubricid: 'rubricId',
  maxuses: 'maxUses', usedcount: 'usedCount', expiresat: 'expiresAt', amountminor: 'amountMinor',
  sizebytes: 'sizeBytes', mimetype: 'mimeType', extractedtext: 'extractedText',
  orgslug: 'orgSlug', orgname: 'orgName', orgkind: 'orgKind', membershipid: 'membershipId',
  testtitle: 'testTitle', testmodule: 'testModule', testcontent: 'testContent', testvariant: 'testVariant',
  candidatename: 'candidateName', candidateemail: 'candidateEmail', sessionname: 'sessionName',
  pricecredits: 'priceCredits'
};

function camelizeRow<T>(row: QueryResultRow): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [CAMEL_KEYS[key] ?? key, value])) as T;
}

function all<T extends QueryResultRow = QueryResultRow>(sql: string, ...p: unknown[]): T[] { return query(sql, ...p).rows.map(camelizeRow<T>); }
function one<T extends QueryResultRow = QueryResultRow>(sql: string, ...p: unknown[]): T | null { return all<T>(sql, ...p)[0] ?? null; }
function run(sql: string, ...p: unknown[]) { return query(sql, ...p); }
function count(sql: string, ...p: unknown[]): number { return Number(one<{ n: number }>(sql, ...p)?.n ?? 0); }

/** Builds `SET a = ?, b = ?` from a patch object, skipping undefined values. */
function setters(patch: Record<string, unknown>): { clause: string; values: unknown[] } {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  return { clause: keys.map((k) => `${k} = ?`).join(', '), values: keys.map((k) => patch[k]) };
}

export function shortCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/* ------------------------------------------------------------------ */
/* Organisations                                                       */
/* ------------------------------------------------------------------ */

export const orgs = {
  list: () => all<OrganizationRow>('SELECT * FROM organizations ORDER BY kind, name'),
  byId: (orgId: string) => one<OrganizationRow>('SELECT * FROM organizations WHERE id = ?', orgId),
  bySlug: (slug: string) => one<OrganizationRow>('SELECT * FROM organizations WHERE slug = ?', slug),
  platform: () => one<OrganizationRow>("SELECT * FROM organizations WHERE kind = 'platform' LIMIT 1"),
  count: () => count('SELECT COUNT(*) n FROM organizations'),
  memberCount: (orgId: string) => count('SELECT COUNT(*) n FROM memberships WHERE orgId = ?', orgId),
  create(input: {
    slug: string; name: string; kind?: 'platform' | 'tenant'; plan?: string;
    branding?: Partial<Branding>; settings?: Partial<OrgSettings>;
  }): OrganizationRow {
    const row: OrganizationRow = {
      id: id(),
      slug: input.slug,
      name: input.name,
      kind: input.kind ?? 'tenant',
      plan: input.plan ?? 'starter',
      branding: JSON.stringify({ ...DEFAULT_BRANDING, wordmark: input.name, ...input.branding }),
      settings: JSON.stringify({ ...DEFAULT_ORG_SETTINGS, ...input.settings }),
      createdAt: now(),
    };
    run(`INSERT INTO organizations (id, slug, name, kind, plan, branding, settings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.slug, row.name, row.kind, row.plan, row.branding, row.settings, row.createdAt);
    return row;
  },
  update(orgId: string, patch: Partial<Omit<OrganizationRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE organizations SET ${clause} WHERE id = ?`, ...values, orgId);
    return orgs.byId(orgId);
  },
  remove: (orgId: string) => run('DELETE FROM organizations WHERE id = ?', orgId),
};

export function brandingOf(org: OrganizationRow | null | undefined): Branding {
  if (!org) return DEFAULT_BRANDING;
  try { return { ...DEFAULT_BRANDING, ...JSON.parse(org.branding) }; } catch { return DEFAULT_BRANDING; }
}
export function settingsOf(org: OrganizationRow | null | undefined): OrgSettings {
  if (!org) return DEFAULT_ORG_SETTINGS;
  try { return { ...DEFAULT_ORG_SETTINGS, ...JSON.parse(org.settings) }; } catch { return DEFAULT_ORG_SETTINGS; }
}

/* ------------------------------------------------------------------ */
/* Users and membership                                                */
/* ------------------------------------------------------------------ */

export interface MemberRow extends UserRow { role: OrgRole; cohort: string | null; membershipId: string }

export const users = {
  byId: (userId: string) => one<UserRow>('SELECT * FROM users WHERE id = ?', userId),
  byUsername: (username: string) =>
    one<UserRow>('SELECT * FROM users WHERE username = ?', username.trim().toLowerCase()),
  byEmail: (email: string) => one<UserRow>('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase()),
  /** Login accepts either the username or the email address. */
  byLogin(login: string) {
    const key = login.trim().toLowerCase();
    return one<UserRow>('SELECT * FROM users WHERE username = ? OR email = ?', key, key);
  },
  count: () => count('SELECT COUNT(*) n FROM users'),
  create(input: {
    email: string; username: string; passwordHash: string; displayName: string;
    candidateRef?: string | null; isPlatformAdmin?: boolean; credits?: number;
  }): UserRow {
    const row: UserRow = {
      id: id(),
      email: input.email.trim().toLowerCase(),
      username: input.username.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      candidateRef: input.candidateRef ?? null,
      isPlatformAdmin: input.isPlatformAdmin ? 1 : 0,
      credits: input.credits ?? 0,
      createdAt: now(),
    };
    run(`INSERT INTO users (id, email, username, passwordHash, displayName, candidateRef, isPlatformAdmin, credits, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.email, row.username, row.passwordHash, row.displayName,
      row.candidateRef, row.isPlatformAdmin, row.credits, row.createdAt);
    return row;
  },
  update(userId: string, patch: Partial<Omit<UserRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE users SET ${clause} WHERE id = ?`, ...values, userId);
    return users.byId(userId);
  },
  addCredits(userId: string, delta: number) {
    run('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?', delta, userId);
    return users.byId(userId);
  },
  attemptCount: (userId: string) => count('SELECT COUNT(*) n FROM attempts WHERE userId = ?', userId),
};

export const memberships = {
  of: (userId: string) =>
    all<MembershipRow & { orgSlug: string; orgName: string; orgKind: string }>(
      `SELECT m.*, o.slug AS orgSlug, o.name AS orgName, o.kind AS orgKind
       FROM memberships m JOIN organizations o ON o.id = m.orgId
       WHERE m.userId = ? ORDER BY o.kind, o.name`, userId),
  find: (userId: string, orgId: string) =>
    one<MembershipRow>('SELECT * FROM memberships WHERE userId = ? AND orgId = ?', userId, orgId),
  listOrg: (orgId: string) =>
    all<MemberRow>(
      `SELECT u.*, m.role AS role, m.cohort AS cohort, m.id AS membershipId
       FROM memberships m JOIN users u ON u.id = m.userId
       WHERE m.orgId = ? ORDER BY m.role, u.displayName`, orgId),
  countOrg: (orgId: string, role?: OrgRole) =>
    role ? count('SELECT COUNT(*) n FROM memberships WHERE orgId = ? AND role = ?', orgId, role)
         : count('SELECT COUNT(*) n FROM memberships WHERE orgId = ?', orgId),
  upsert(userId: string, orgId: string, role: OrgRole, cohort?: string | null): MembershipRow {
    const existing = memberships.find(userId, orgId);
    if (existing) {
      run('UPDATE memberships SET role = ?, cohort = ? WHERE id = ?', role, cohort ?? existing.cohort, existing.id);
      return { ...existing, role, cohort: cohort ?? existing.cohort };
    }
    const row: MembershipRow = { id: id(), userId, orgId, role, cohort: cohort ?? null, createdAt: now() };
    run(`INSERT INTO memberships (id, userId, orgId, role, cohort, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      row.id, row.userId, row.orgId, row.role, row.cohort, row.createdAt);
    return row;
  },
  remove: (membershipId: string) => run('DELETE FROM memberships WHERE id = ?', membershipId),
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

export const tests = {
  listOrg: (orgId: string) => all<TestRow>('SELECT * FROM tests WHERE orgId = ? ORDER BY updatedAt DESC', orgId),
  publishedOrg: (orgId: string) =>
    all<TestRow>("SELECT * FROM tests WHERE orgId = ? AND status = 'published' ORDER BY updatedAt DESC", orgId),
  catalogue: () =>
    all<TestRow>("SELECT * FROM tests WHERE visibility = 'catalog' AND status = 'published' ORDER BY updatedAt DESC"),
  byId: (testId: string) => one<TestRow>('SELECT * FROM tests WHERE id = ?', testId),
  byTitle: (orgId: string, title: string) =>
    one<TestRow>('SELECT * FROM tests WHERE orgId = ? AND title = ?', orgId, title),
  count: (orgId?: string, status?: string) => {
    if (orgId && status) return count('SELECT COUNT(*) n FROM tests WHERE orgId = ? AND status = ?', orgId, status);
    if (orgId) return count('SELECT COUNT(*) n FROM tests WHERE orgId = ?', orgId);
    return count('SELECT COUNT(*) n FROM tests');
  },
  attemptCount: (testId: string) => count('SELECT COUNT(*) n FROM attempts WHERE testId = ?', testId),
  create(input: {
    orgId: string; title: string; module: string; variant: string; status: string;
    durationMin: number; content: string; visibility?: string; priceCredits?: number;
  }): TestRow {
    const t = now();
    const row = {
      id: id(), visibility: 'private', priceCredits: 0, ...input, createdAt: t, updatedAt: t,
    } as TestRow;
    run(`INSERT INTO tests (id, orgId, title, module, variant, status, durationMin, content, visibility, priceCredits, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.title, row.module, row.variant, row.status, row.durationMin,
      row.content, row.visibility, row.priceCredits, row.createdAt, row.updatedAt);
    return row;
  },
  update(testId: string, patch: Partial<Omit<TestRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE tests SET ${clause}, updatedAt = ? WHERE id = ?`, ...values, now(), testId);
    return tests.byId(testId);
  },
  remove: (testId: string) => run('DELETE FROM tests WHERE id = ?', testId),
};

/* ------------------------------------------------------------------ */
/* Sittings                                                            */
/* ------------------------------------------------------------------ */

export interface SessionWithTest extends ExamSessionRow { testTitle: string; testModule: string }

export const sittings = {
  listOrg: (orgId: string) =>
    all<SessionWithTest>(
      `SELECT s.*, t.title AS testTitle, t.module AS testModule
       FROM exam_sessions s JOIN tests t ON t.id = s.testId
       WHERE s.orgId = ? ORDER BY s.createdAt DESC`, orgId),
  byId: (sessionId: string) =>
    one<SessionWithTest>(
      `SELECT s.*, t.title AS testTitle, t.module AS testModule
       FROM exam_sessions s JOIN tests t ON t.id = s.testId WHERE s.id = ?`, sessionId),
  byCode: (code: string) =>
    one<SessionWithTest>(
      `SELECT s.*, t.title AS testTitle, t.module AS testModule
       FROM exam_sessions s JOIN tests t ON t.id = s.testId WHERE s.accessCode = ?`,
      code.trim().toUpperCase()),
  attemptCount: (sessionId: string) => count('SELECT COUNT(*) n FROM attempts WHERE sessionId = ?', sessionId),
  create(input: {
    orgId: string; testId: string; name: string; opensAt?: string | null; closesAt?: string | null;
    durationMin?: number; settings?: Partial<typeof DEFAULT_SESSION_SETTINGS>; accessCode?: string;
  }): ExamSessionRow {
    let code = (input.accessCode || shortCode()).toUpperCase();
    while (sittings.byCode(code)) code = shortCode();
    const row: ExamSessionRow = {
      id: id(), orgId: input.orgId, testId: input.testId, name: input.name, accessCode: code,
      opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null,
      durationMin: input.durationMin ?? 0, status: 'scheduled',
      settings: JSON.stringify({ ...DEFAULT_SESSION_SETTINGS, ...input.settings }), createdAt: now(),
    };
    run(`INSERT INTO exam_sessions (id, orgId, testId, name, accessCode, opensAt, closesAt, durationMin, status, settings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.testId, row.name, row.accessCode, row.opensAt, row.closesAt,
      row.durationMin, row.status, row.settings, row.createdAt);
    return row;
  },
  update(sessionId: string, patch: Partial<Omit<ExamSessionRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE exam_sessions SET ${clause} WHERE id = ?`, ...values, sessionId);
    return sittings.byId(sessionId);
  },
  remove: (sessionId: string) => run('DELETE FROM exam_sessions WHERE id = ?', sessionId),
};

/* ------------------------------------------------------------------ */
/* Attempts                                                            */
/* ------------------------------------------------------------------ */

export interface AttemptWithRefs extends AttemptRow {
  testTitle: string; testModule: string; testContent: string; testVariant: string;
  candidateName: string; candidateRef: string | null; candidateEmail: string;
  sessionName: string | null; orgSlug: string; orgName: string;
}

const ATTEMPT_JOIN = `
  SELECT a.*, t.title AS testTitle, t.module AS testModule, t.content AS testContent, t.variant AS testVariant,
         u.displayName AS candidateName, u.candidateRef AS candidateRef, u.email AS candidateEmail,
         s.name AS sessionName, o.slug AS orgSlug, o.name AS orgName
  FROM attempts a
  JOIN tests t ON t.id = a.testId
  JOIN users u ON u.id = a.userId
  JOIN organizations o ON o.id = a.orgId
  LEFT JOIN exam_sessions s ON s.id = a.sessionId`;

export const attempts = {
  byId: (attemptId: string) => one<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.id = ?`, attemptId),
  listOrg: (orgId: string, limit = 200) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.orgId = ? ORDER BY a.startedAt DESC LIMIT ?`, orgId, limit),
  listSession: (sessionId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.sessionId = ? ORDER BY a.startedAt DESC`, sessionId),
  listForUser: (userId: string, limit = 30) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.userId = ? ORDER BY a.startedAt DESC LIMIT ?`, userId, limit),
  listForTest: (testId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.testId = ? ORDER BY a.startedAt DESC`, testId),
  awaitingMarking: (orgId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.orgId = ? AND a.status IN ('submitted','marking')
                          ORDER BY a.submittedAt ASC`, orgId),
  activeFor: (testId: string, userId: string) =>
    one<AttemptRow>(`SELECT * FROM attempts WHERE testId = ? AND userId = ? AND status = 'in_progress'
                     ORDER BY startedAt DESC LIMIT 1`, testId, userId),
  count: (orgId?: string) =>
    orgId ? count('SELECT COUNT(*) n FROM attempts WHERE orgId = ?', orgId)
          : count('SELECT COUNT(*) n FROM attempts'),
  create(input: { orgId: string; testId: string; userId: string; endsAt: string; sessionId?: string | null }): AttemptRow {
    const row: AttemptRow = {
      id: id(), orgId: input.orgId, testId: input.testId, sessionId: input.sessionId ?? null,
      userId: input.userId, status: 'in_progress', startedAt: now(), endsAt: input.endsAt,
      submittedAt: null, answers: '{}', annotations: '[]', flags: '[]',
      rawScore: null, manualScore: null, band: null, report: null, createdAt: now(),
    };
    run(`INSERT INTO attempts (id, orgId, testId, sessionId, userId, status, startedAt, endsAt, answers, annotations, flags, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.testId, row.sessionId, row.userId, row.status, row.startedAt,
      row.endsAt, row.answers, row.annotations, row.flags, row.createdAt);
    return row;
  },
  update(attemptId: string, patch: Partial<Omit<AttemptRow, 'id'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE attempts SET ${clause} WHERE id = ?`, ...values, attemptId);
  },
  remove: (attemptId: string) => run('DELETE FROM attempts WHERE id = ?', attemptId),
};

export const events = {
  add(attemptId: string, type: string, meta: Record<string, unknown> = {}) {
    run('INSERT INTO attempt_events (id, attemptId, type, at, meta) VALUES (?, ?, ?, ?, ?)',
      id(), attemptId, type, now(), JSON.stringify(meta));
  },
  list: (attemptId: string) =>
    all<AttemptEventRow>('SELECT * FROM attempt_events WHERE attemptId = ? ORDER BY at', attemptId),
  countByType: (attemptId: string) =>
    all<{ type: string; n: number }>(
      'SELECT type, COUNT(*) n FROM attempt_events WHERE attemptId = ? GROUP BY type', attemptId),
};

/* ------------------------------------------------------------------ */
/* Marking                                                             */
/* ------------------------------------------------------------------ */

export const rubrics = {
  listOrg: (orgId: string) => all<RubricRow>('SELECT * FROM rubrics WHERE orgId = ? ORDER BY name', orgId),
  byId: (rubricId: string) => one<RubricRow>('SELECT * FROM rubrics WHERE id = ?', rubricId),
  create(input: { orgId: string; name: string; criteria: string }): RubricRow {
    const row: RubricRow = { id: id(), ...input, createdAt: now() };
    run('INSERT INTO rubrics (id, orgId, name, criteria, createdAt) VALUES (?, ?, ?, ?, ?)',
      row.id, row.orgId, row.name, row.criteria, row.createdAt);
    return row;
  },
  update(rubricId: string, patch: Partial<Omit<RubricRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE rubrics SET ${clause} WHERE id = ?`, ...values, rubricId);
    return rubrics.byId(rubricId);
  },
  remove: (rubricId: string) => run('DELETE FROM rubrics WHERE id = ?', rubricId),
};

export const markings = {
  forAttempt: (attemptId: string) =>
    all<MarkingRow>('SELECT * FROM markings WHERE attemptId = ?', attemptId),
  save(input: {
    attemptId: string; questionId: string; markerId: string; rubricId?: string | null;
    scores: string; comment: string; awarded: number;
  }) {
    const existing = one<MarkingRow>(
      'SELECT * FROM markings WHERE attemptId = ? AND questionId = ?', input.attemptId, input.questionId);
    if (existing) {
      run(`UPDATE markings SET markerId = ?, rubricId = ?, scores = ?, comment = ?, awarded = ? WHERE id = ?`,
        input.markerId, input.rubricId ?? null, input.scores, input.comment, input.awarded, existing.id);
      return;
    }
    run(`INSERT INTO markings (id, attemptId, questionId, markerId, rubricId, scores, comment, awarded, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id(), input.attemptId, input.questionId, input.markerId, input.rubricId ?? null,
      input.scores, input.comment, input.awarded, now());
  },
};

/* ------------------------------------------------------------------ */
/* Commerce                                                            */
/* ------------------------------------------------------------------ */

export const accessCodes = {
  list: (orgId?: string) =>
    orgId ? all<AccessCodeRow>('SELECT * FROM access_codes WHERE orgId = ? ORDER BY createdAt DESC', orgId)
          : all<AccessCodeRow>('SELECT * FROM access_codes ORDER BY createdAt DESC'),
  byCode: (code: string) => one<AccessCodeRow>('SELECT * FROM access_codes WHERE code = ?', code.trim().toUpperCase()),
  create(input: {
    orgId?: string | null; testId?: string | null; credits?: number; maxUses?: number;
    expiresAt?: string | null; note?: string; code?: string;
  }): AccessCodeRow {
    let code = (input.code || `EX-${shortCode(8)}`).toUpperCase();
    while (accessCodes.byCode(code)) code = `EX-${shortCode(8)}`;
    const row: AccessCodeRow = {
      id: id(), code, orgId: input.orgId ?? null, testId: input.testId ?? null,
      credits: input.credits ?? 1, maxUses: input.maxUses ?? 1, usedCount: 0,
      expiresAt: input.expiresAt ?? null, note: input.note ?? '', createdAt: now(),
    };
    run(`INSERT INTO access_codes (id, code, orgId, testId, credits, maxUses, usedCount, expiresAt, note, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.code, row.orgId, row.testId, row.credits, row.maxUses, row.usedCount,
      row.expiresAt, row.note, row.createdAt);
    return row;
  },
  consume(codeId: string) { run('UPDATE access_codes SET usedCount = usedCount + 1 WHERE id = ?', codeId); },
  remove: (codeId: string) => run('DELETE FROM access_codes WHERE id = ?', codeId),
};

export const orders = {
  listForUser: (userId: string) =>
    all<OrderRow>('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC', userId),
  listAll: (limit = 200) => all<OrderRow>('SELECT * FROM orders ORDER BY createdAt DESC LIMIT ?', limit),
  byId: (orderId: string) => one<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId),
  create(input: {
    userId: string; orgId?: string | null; description: string; amountMinor: number;
    currency?: string; credits: number; provider: string; reference?: string | null;
  }): OrderRow {
    const row: OrderRow = {
      id: id(), userId: input.userId, orgId: input.orgId ?? null, description: input.description,
      amountMinor: input.amountMinor, currency: input.currency ?? 'VND', credits: input.credits,
      provider: input.provider, status: 'pending', reference: input.reference ?? null, createdAt: now(),
    };
    run(`INSERT INTO orders (id, userId, orgId, description, amountMinor, currency, credits, provider, status, reference, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.userId, row.orgId, row.description, row.amountMinor, row.currency,
      row.credits, row.provider, row.status, row.reference, row.createdAt);
    return row;
  },
  setStatus(orderId: string, status: OrderRow['status'], reference?: string) {
    run('UPDATE orders SET status = ?, reference = COALESCE(?, reference) WHERE id = ?', status, reference ?? null, orderId);
  },
};

/* ------------------------------------------------------------------ */
/* Imports                                                             */
/* ------------------------------------------------------------------ */

export const imports = {
  byId: (importId: string) => one<ImportRow>('SELECT * FROM imports WHERE id = ?', importId),
  listOrg: (orgId: string, limit = 40) =>
    all<ImportRow>('SELECT * FROM imports WHERE orgId = ? ORDER BY createdAt DESC LIMIT ?', orgId, limit),
  count: (orgId?: string) =>
    orgId ? count('SELECT COUNT(*) n FROM imports WHERE orgId = ?', orgId) : count('SELECT COUNT(*) n FROM imports'),
  create(input: { orgId: string; filename: string; mimeType: string; sizeBytes: number; strategy: string }): ImportRow {
    const row: ImportRow = {
      id: id(), orgId: input.orgId, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.sizeBytes, status: 'pending', strategy: input.strategy, provider: null,
      extractedText: null, draft: null, warnings: '[]', error: null, testId: null, createdAt: now(),
    };
    run(`INSERT INTO imports (id, orgId, filename, mimeType, sizeBytes, status, strategy, warnings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.filename, row.mimeType, row.sizeBytes, row.status,
      row.strategy, row.warnings, row.createdAt);
    return row;
  },
  update(importId: string, patch: Partial<Omit<ImportRow, 'id'>>) {
    const { clause, values } = setters(patch);
    if (clause) run(`UPDATE imports SET ${clause} WHERE id = ?`, ...values, importId);
  },
};
