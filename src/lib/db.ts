/**
 * Data layer.
 *
 * PostgreSQL through `pg`. Every query in the product lives in this file, so
 * the storage engine is a contained choice and the rest of the app only sees
 * functions that return promises.
 *
 * Tenancy: one database, every row that belongs to a customer carries `orgId`,
 * and every query that reads customer data takes an orgId. The public B2C
 * catalogue is itself an organisation (`kind = 'platform'`).
 *
 * Connection: `DATABASE_URL` (or `POSTGRES_URL`). On Vercel use the pooled
 * connection string of whichever Postgres you attached.
 */

import { Pool, types } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import {
  AccessCodeRow, AttemptEventRow, AttemptRow, Branding, ExamSessionRow, ImportRow, MarkingRow,
  MembershipRow, OrderRow, OrgKind, OrgRole, OrgSettings, OrganizationRow, RubricRow, TestRow, UserRow,
} from '@/types/db';
import { DEFAULT_BRANDING, DEFAULT_ORG_SETTINGS, DEFAULT_SESSION_SETTINGS } from './defaults';

export { DEFAULT_BRANDING, DEFAULT_ORG_SETTINGS, DEFAULT_SESSION_SETTINGS };

// Server only. Values the browser also needs live in ./defaults so importing
// them never drags the database driver into a client bundle.
if (typeof window !== 'undefined') {
  throw new Error('src/lib/db.ts was imported from the browser. Import from src/lib/defaults.ts instead.');
}

// COUNT() and SUM() come back as strings because they are int8 / numeric.
// The product treats them as numbers everywhere, so parse them at the driver.
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1700, (v) => Number(v));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'tenant',
  joinCode TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'starter',
  branding TEXT NOT NULL DEFAULT '{}',
  settings TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  -- Optional: with no mail server configured an account is username + password.
  email TEXT UNIQUE,
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
  -- 1 when the paper may be drawn on to build a full test at random.
  bank INTEGER NOT NULL DEFAULT 0,
  -- Where it came from: "Cambridge IELTS 15", "Đề HSG Nghệ An 2024".
  source TEXT,
  -- The folder it is filed under, for staff and candidates alike.
  folder TEXT,
  -- 1 when every organisation on the platform may copy it: the Testora library.
  shared INTEGER NOT NULL DEFAULT 0,
  -- Counted once when the paper is written, so a list of papers never has to
  -- open them. A paper is one large JSON document; reading three hundred of
  -- them to print "40 questions" three hundred times is the single most
  -- expensive thing this platform used to do.
  questionCount INTEGER,
  hasAudio INTEGER NOT NULL DEFAULT 0,
  -- The paper's own one-line description, copied out so a catalogue card can
  -- show it without opening the paper.
  summary TEXT,
  -- A fingerprint of the questions, so the same paper is not imported twice.
  fingerprint TEXT,
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

CREATE TABLE IF NOT EXISTS suites (
  id TEXT PRIMARY KEY,
  orgId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ielts',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  visibility TEXT NOT NULL DEFAULT 'private',
  priceCredits INTEGER NOT NULL DEFAULT 0,
  -- [{ skill, testId, durationMin, videoUrl, mode }]
  items TEXT NOT NULL DEFAULT '[]',
  -- { allowPractice, allowSimulation, practiceMaxMinutes, assembledFor }
  settings TEXT NOT NULL DEFAULT '{}',
  -- The folder it is filed under.
  folder TEXT,
  -- Set when this test was drawn at random for one candidate: only they see it.
  -- A column of its own rather than a field inside the settings JSON, because
  -- every dashboard asks for "the tests nobody claimed, plus mine", and a
  -- leading-wildcard LIKE over JSON cannot use an index.
  assembledFor TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS suites_org ON suites(orgId);

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
  rawScore REAL,
  manualScore REAL,
  band REAL,
  report TEXT,
  suiteId TEXT REFERENCES suites(id) ON DELETE SET NULL,
  skill TEXT,
  untimed INTEGER NOT NULL DEFAULT 0,
  -- 'exam' counts towards the report; 'practice' is the candidate's own work.
  mode TEXT NOT NULL DEFAULT 'exam',
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
  markerId TEXT REFERENCES users(id) ON DELETE SET NULL,
  rubricId TEXT REFERENCES rubrics(id) ON DELETE SET NULL,
  scores TEXT NOT NULL DEFAULT '{}',
  comment TEXT NOT NULL DEFAULT '',
  awarded REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'human',
  feedback TEXT NOT NULL DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS org_applications (
  id TEXT PRIMARY KEY,
  orgName TEXT NOT NULL,
  contactName TEXT NOT NULL,
  contactEmail TEXT NOT NULL,
  contactPhone TEXT NOT NULL,
  -- Where they are and roughly how many candidates, in their own words.
  reason TEXT NOT NULL,
  candidates TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT NOT NULL DEFAULT '',
  reviewedBy TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewedAt TEXT,
  orgId TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS org_applications_status ON org_applications(status);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'verify-email',
  attempts INTEGER NOT NULL DEFAULT 0,
  expiresAt TEXT NOT NULL,
  usedAt TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_user ON verification_codes(userId);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  orgId TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  userId TEXT REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  inputTokens INTEGER NOT NULL DEFAULT 0,
  outputTokens INTEGER NOT NULL DEFAULT 0,
  costMicros INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  meta TEXT NOT NULL DEFAULT '{}',
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_org ON ai_usage(orgId);
CREATE INDEX IF NOT EXISTS ai_usage_created ON ai_usage(createdAt);


CREATE TABLE IF NOT EXISTS suite_results (
  id TEXT PRIMARY KEY,
  suiteId TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- { listening: 8.5, reading: 9, ... } for skills marked offline
  manualBands TEXT NOT NULL DEFAULT '{}',
  releasedAt TEXT,
  UNIQUE (suiteId, userId)
);

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
  -- 'upload' is a file; 'generate' is a paper written by the model to order.
  kind TEXT NOT NULL DEFAULT 'upload',
  -- What the operator asked the model to write, for a generated paper.
  instructions TEXT,
  -- Every paper this job produced: a book makes many.
  testIds TEXT NOT NULL DEFAULT '[]',
  -- "Reading test 3 of 12", shown while the job runs.
  progress TEXT,
  createdAt TEXT NOT NULL
);
`;

/* ------------------------------------------------------------------ */
/* Driver                                                              */
/* ------------------------------------------------------------------ */

/**
 * One pool per process. On Vercel each serverless instance keeps its own, so
 * the pool stays small on purpose and a pooled connection string (Neon's
 * `-pooler` host, Supabase's port 6543, or Vercel Postgres) is what you want in
 * `DATABASE_URL`. The pool is cached on `globalThis` so hot reloads in
 * development do not open a new one on every edit.
 */
const globalForDb = globalThis as unknown as { __testoraPool?: Pool; __testoraReady?: Promise<void> };

/**
 * Any of the names a hosted Postgres hands you. Attaching a database in the
 * Vercel dashboard sets one of these by itself, so a normal deployment never
 * needs a connection string typed in anywhere.
 */
const URL_VARS = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'DATABASE_POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'NEON_DATABASE_URL',
  'SUPABASE_DB_URL',
];

export function databaseUrl(): string | null {
  for (const name of URL_VARS) {
    const value = process.env[name];
    if (value && value.startsWith('post')) return value;
  }
  return null;
}

/** True when this deployment has a database attached at all. */
export function databaseConfigured(): boolean {
  return !!databaseUrl();
}

function connectionString(): string {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      'No database is attached. Add one in the hosting dashboard (it sets DATABASE_URL or '
      + 'POSTGRES_URL for you), or set DATABASE_URL yourself.',
    );
  }
  return url;
}

export function pool(): Pool {
  if (!globalForDb.__testoraPool) {
    const url = connectionString();
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    globalForDb.__testoraPool = new Pool({
      connectionString: url,
      // Managed Postgres (Neon, Supabase, Vercel) terminates TLS with a cert
      // the container does not carry a root for; a local database has no TLS.
      ssl: local || process.env.PGSSLMODE === 'disable' ? undefined : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX || (process.env.VERCEL ? 1 : 10)),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForDb.__testoraPool;
}

/** Creates the schema. Runs once per process, and is safe to run repeatedly. */
export function migrate(): Promise<void> {
  if (!globalForDb.__testoraReady) {
    globalForDb.__testoraReady = (async () => {
      const client = await pool().connect();
      try {
        // Two cold starts can arrive together; the lock makes the second wait
        // rather than race the first through CREATE TABLE.
        await client.query('SELECT pg_advisory_lock(4207311)');
        try {
          await client.query(SCHEMA);
          for (const [table, column, decl] of LATER_COLUMNS) {
            await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${decl}`);
          }
          // Databases created before accounts could exist without an email.
          await client.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL').catch(() => {});
          // A sitting may be for a full test rather than one paper.
          await client.query('ALTER TABLE exam_sessions ALTER COLUMN testId DROP NOT NULL').catch(() => {});
          // A writing mark is a rubric average, so scores are fractional.
          for (const column of ['rawScore', 'manualScore']) {
            await client.query(`ALTER TABLE attempts ALTER COLUMN ${column} TYPE REAL`).catch(() => {});
          }
          /*
           * A question that was marked twice — by two markers, or by a marker
           * and the model at the same moment — has two rows, and the unique
           * index below cannot be built until the older one is gone. The newest
           * mark is the one that stands.
           */
          await client.query(
            `DELETE FROM markings m USING markings other
             WHERE m.attemptid = other.attemptid AND m.questionid = other.questionid
               AND (m.createdat < other.createdat OR (m.createdat = other.createdat AND m.id < other.id))`,
          ).catch(() => {});
          for (const statement of LATER_INDEXES) {
            await client.query(statement).catch(() => {});
          }
          /*
           * Indexes that a wider one now covers. They were created under names
           * this file no longer uses, so `CREATE INDEX IF NOT EXISTS` would
           * have quietly left the narrow version in place and the composite
           * never built — the reason the new ones are named after their
           * columns. Dropping the old ones keeps writes cheap.
           */
          for (const dead of [
            'attempts_user', 'attempts_org', 'attempts_session',
            'tests_org', 'suites_org', 'ai_usage_org', 'events_attempt',
          ]) {
            await client.query(`DROP INDEX IF EXISTS ${dead}`).catch(() => {});
          }
          /*
           * Papers written before the counts were columns have them empty, and
           * a list showing "0 questions" is worse than one that is slow. They
           * are filled in here, a batch at a time, so a large old bank does not
           * make the first boot after this deployment crawl — later boots pick
           * up whatever is left.
           */
          const stale = await client.query<{ id: string; content: string }>(
            `SELECT id, content FROM tests
             WHERE questioncount IS NULL OR fingerprint IS NULL
             LIMIT 200`,
          );
          for (const row of stale.rows) {
            const stats = paperStats(row.content);
            await client.query(
              `UPDATE tests SET questioncount = $1, hasaudio = $2, summary = $3, fingerprint = $4
               WHERE id = $5`,
              [stats.questionCount, stats.hasAudio, stats.summary, stats.fingerprint, row.id],
            ).catch(() => {});
          }
          /*
           * The same for a full test drawn for one candidate: it used to be
           * recorded only inside the settings JSON, and the column is what the
           * dashboards now read.
           */
          await client.query(
            `UPDATE suites SET assembledfor = substring(settings from '"assembledFor":"([^"]+)"')
             WHERE assembledfor IS NULL AND settings LIKE '%"assembledFor":"%'`,
          ).catch(() => {});
        } finally {
          await client.query('SELECT pg_advisory_unlock(4207311)');
        }
      } finally {
        client.release();
      }
    })().catch((err) => { globalForDb.__testoraReady = undefined; throw err; });
  }
  return globalForDb.__testoraReady;
}

/**
 * Indexes added after the first release.
 *
 * They live here rather than in the schema above because several of them are
 * over columns that are themselves added later: on an existing database the
 * schema block runs before those columns exist, and one failing statement used
 * to abort the whole migration. Each is applied on its own and separately
 * tolerated, so a database that cannot take one still gets the rest.
 */
const LATER_INDEXES: string[] = [
  // Postgres does not index a foreign key for you, and each of these is a
  // column the console filters or sorts by on a page a school opens daily.
  'CREATE INDEX IF NOT EXISTS attempts_user_started ON attempts(userId, startedAt DESC)',
  'CREATE INDEX IF NOT EXISTS attempts_org_started ON attempts(orgId, startedAt DESC)',
  'CREATE INDEX IF NOT EXISTS attempts_session_user ON attempts(sessionId, userId)',
  'CREATE INDEX IF NOT EXISTS attempts_test ON attempts(testId)',
  'CREATE INDEX IF NOT EXISTS attempts_suite ON attempts(suiteId, userId)',
  'CREATE INDEX IF NOT EXISTS attempts_marking ON attempts(orgId, status, submittedAt)',
  'CREATE INDEX IF NOT EXISTS tests_org_updated ON tests(orgId, updatedAt DESC)',
  'CREATE INDEX IF NOT EXISTS tests_catalogue ON tests(visibility, status)',
  'CREATE INDEX IF NOT EXISTS tests_library ON tests(shared, status)',
  'CREATE INDEX IF NOT EXISTS tests_bank ON tests(orgId, bank, status)',
  'CREATE INDEX IF NOT EXISTS tests_fingerprint ON tests(orgId, fingerprint)',
  'CREATE INDEX IF NOT EXISTS suites_org_updated ON suites(orgId, updatedAt DESC)',
  'CREATE INDEX IF NOT EXISTS suites_catalogue ON suites(visibility, status)',
  'CREATE INDEX IF NOT EXISTS suites_assembled ON suites(assembledFor)',
  'CREATE INDEX IF NOT EXISTS imports_org ON imports(orgId, createdAt DESC)',
  'CREATE INDEX IF NOT EXISTS imports_status ON imports(status, createdAt)',
  'CREATE INDEX IF NOT EXISTS imports_user ON imports(userId, createdAt DESC)',
  'CREATE INDEX IF NOT EXISTS ai_usage_org_created ON ai_usage(orgId, createdAt DESC)',
  'CREATE INDEX IF NOT EXISTS events_attempt_type ON attempt_events(attemptId, type)',
  'CREATE INDEX IF NOT EXISTS rubrics_org ON rubrics(orgId)',
  'CREATE INDEX IF NOT EXISTS orders_user ON orders(userId)',
  'CREATE INDEX IF NOT EXISTS users_hf ON users(hfId)',
  'CREATE INDEX IF NOT EXISTS markings_attempt ON markings(attemptId)',
  // One mark per question per attempt. Without it two markers saving at the
  // same moment leave two rows, and the score is the sum of both.
  'CREATE UNIQUE INDEX IF NOT EXISTS markings_one_per_question ON markings(attemptId, questionId)',
];

/** Columns added after the first release. */
const LATER_COLUMNS: [string, string, string][] = [
  ['users', 'emailVerifiedAt', 'TEXT'],
  ['users', 'hfId', 'TEXT'],
  ['users', 'hfName', 'TEXT'],
  ['users', 'avatarUrl', 'TEXT'],
  ['imports', 'storageKey', 'TEXT'],
  ['imports', 'storedIn', "TEXT NOT NULL DEFAULT '[]'"],
  ['imports', 'expiresAt', 'TEXT'],
  ['imports', 'purgedAt', 'TEXT'],
  ['attempts', 'suiteId', 'TEXT'],
  ['attempts', 'skill', 'TEXT'],
  ['attempts', 'untimed', 'INTEGER NOT NULL DEFAULT 0'],
  ['markings', 'source', "TEXT NOT NULL DEFAULT 'human'"],
  ['markings', 'feedback', "TEXT NOT NULL DEFAULT '{}'"],
  ['organizations', 'joinCode', 'TEXT'],
  ['exam_sessions', 'suiteId', 'TEXT'],
  ['tests', 'bank', 'INTEGER NOT NULL DEFAULT 0'],
  ['tests', 'source', 'TEXT'],
  ['tests', 'folder', 'TEXT'],
  ['tests', 'shared', 'INTEGER NOT NULL DEFAULT 0'],
  ['tests', 'questionCount', 'INTEGER'],
  ['tests', 'hasAudio', 'INTEGER NOT NULL DEFAULT 0'],
  ['tests', 'summary', 'TEXT'],
  ['tests', 'fingerprint', 'TEXT'],
  ['suites', 'folder', 'TEXT'],
  ['suites', 'assembledFor', 'TEXT'],
  ['suites', 'settings', "TEXT NOT NULL DEFAULT '{}'"],
  ['attempts', 'mode', "TEXT NOT NULL DEFAULT 'exam'"],
  ['imports', 'kind', "TEXT NOT NULL DEFAULT 'upload'"],
  ['imports', 'instructions', 'TEXT'],
  ['imports', 'testIds', "TEXT NOT NULL DEFAULT '[]'"],
  ['imports', 'progress', 'TEXT'],
  ['imports', 'options', 'TEXT'],
  ['imports', 'userId', 'TEXT'],
  ['imports', 'claimedAt', 'TEXT'],
];

/**
 * Postgres folds unquoted identifiers to lower case, so `orgId` is stored as
 * `orgid` and comes back that way. Rather than quote every identifier in every
 * query, the driver puts the camel case back on the way out.
 */
const CAMEL: Record<string, string> = {};
for (const name of [
  'accessCode', 'amountMinor', 'attemptId', 'awaitingMarking', 'candidateEmail', 'candidateName',
  'emailVerifiedAt', 'usedAt', 'storageKey', 'storedIn', 'purgedAt', 'lastCheckedAt', 'lastError',
  'hfId', 'hfName', 'avatarUrl',
  'accountId', 'accessKeyId', 'secretKeyEnc', 'publicBaseUrl',
  'orgName', 'contactName', 'contactEmail', 'contactPhone', 'reviewedBy', 'reviewedAt',
  'candidateRef', 'closesAt', 'costMicros', 'createdAt', 'displayName', 'durationMin', 'endsAt',
  'expiresAt', 'extractedText', 'inputTokens', 'isPlatformAdmin', 'joinCode', 'manualBands',
  'manualScore', 'markerId', 'maxUses', 'membershipId', 'mimeType', 'opensAt', 'orgId', 'orgKind',
  'orgName', 'orgSlug', 'outputTokens', 'passwordHash', 'priceCredits', 'questionId', 'rawScore',
  'releasedAt', 'rubricId', 'sessionId', 'sessionName', 'sizeBytes', 'startedAt', 'submittedAt',
  'suiteId', 'suiteTitle', 'testContent', 'testId', 'testModule', 'testTitle', 'testVariant', 'updatedAt',
  'usedCount', 'userId', 'videoUrl', 'testIds', 'ownerName', 'claimedAt', 'attemptCount',
  'questionCount', 'hasAudio', 'assembledFor',
]) CAMEL[name.toLowerCase()] = name;

function camelize<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[CAMEL[key] ?? key] = row[key];
  return out as T;
}

/** Turns the `?` placeholders used throughout this file into `$1, $2, …`. */
function placeholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  await migrate();
  const res = await pool().query(placeholders(sql), params as never[]);
  return res.rows.map((r) => camelize<T>(r as Record<string, unknown>));
}

/** Is the database attached, reachable and migrated? Used by the boot screen. */
export async function databaseReady(): Promise<{ ok: true } | { ok: false; reason: 'unset' | 'unreachable'; error?: string }> {
  if (!databaseConfigured()) return { ok: false, reason: 'unset' };
  try {
    await migrate();
    await pool().query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'unreachable', error: (err as Error).message };
  }
}

const now = () => new Date().toISOString();
const id = () => randomUUID();

async function all<T>(sql: string, ...p: unknown[]): Promise<T[]> { return query<T>(sql, p); }
async function one<T>(sql: string, ...p: unknown[]): Promise<T | null> { return (await query<T>(sql, p))[0] ?? null; }
/**
 * A statement whose rows nobody wants. Exported so the verification suite can
 * tidy up after itself without a second copy of the driver.
 */
export async function run(sql: string, ...p: unknown[]): Promise<void> { await query(sql, p); }
async function count(sql: string, ...p: unknown[]): Promise<number> {
  return Number((await one<{ n: number }>(sql, ...p))?.n ?? 0);
}

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
  /** The shared space every account may join with the platform admin's code. */
  community: () => one<OrganizationRow>("SELECT * FROM organizations WHERE kind = 'community' LIMIT 1"),
  byJoinCode: (code: string) =>
    one<OrganizationRow>('SELECT * FROM organizations WHERE joinCode = ?', code.trim().toUpperCase()),
  count: () => count('SELECT COUNT(*) n FROM organizations'),
  memberCount: (orgId: string) => count('SELECT COUNT(*) n FROM memberships WHERE orgId = ?', orgId),
  async create(input: {
    slug: string; name: string; kind?: OrgKind; plan?: string; joinCode?: string;
    branding?: Partial<Branding>; settings?: Partial<OrgSettings>;
  }): Promise<OrganizationRow> {
    const row: OrganizationRow = {
      id: id(),
      slug: input.slug,
      name: input.name,
      kind: input.kind ?? 'tenant',
      plan: input.plan ?? 'starter',
      joinCode: await freeJoinCode(input.joinCode),
      branding: JSON.stringify({ ...DEFAULT_BRANDING, wordmark: input.name, ...input.branding }),
      settings: JSON.stringify({ ...DEFAULT_ORG_SETTINGS, ...input.settings }),
      createdAt: now(),
    };
    await run(`INSERT INTO organizations (id, slug, name, kind, plan, joinCode, branding, settings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.slug, row.name, row.kind, row.plan, row.joinCode, row.branding, row.settings, row.createdAt);
    return row;
  },
  /** Issues a new join code, invalidating the old one. */
  async rotateJoinCode(orgId: string): Promise<string> {
    const code = await freeJoinCode();
    await run('UPDATE organizations SET joinCode = ? WHERE id = ?', code, orgId);
    return code;
  },
  /** Fills in a join code for organisations created before codes existed. */
  async ensureJoinCode(org: OrganizationRow): Promise<string> {
    if (org.joinCode) return org.joinCode;
    return orgs.rotateJoinCode(org.id);
  },
  async update(orgId: string, patch: Partial<Omit<OrganizationRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE organizations SET ${clause} WHERE id = ?`, ...values, orgId);
    return orgs.byId(orgId);
  },
  remove: (orgId: string) => run('DELETE FROM organizations WHERE id = ?', orgId),
};

/** A join code that no other organisation is using. */
async function freeJoinCode(preferred?: string): Promise<string> {
  let code = (preferred || shortCode(6)).trim().toUpperCase();
  while (await orgs.byJoinCode(code)) code = shortCode(6);
  return code;
}

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
  /** Several accounts at once, for a roster. */
  byIds: (ids: string[]) =>
    ids.length
      ? all<UserRow>(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      : Promise.resolve([]),
  byUsername: (username: string) =>
    one<UserRow>('SELECT * FROM users WHERE username = ?', username.trim().toLowerCase()),
  byEmail: (email: string) => one<UserRow>('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase()),
  /** True before the first administrator exists, which is what /setup fixes. */
  platformAdminCount: () => count('SELECT COUNT(*) n FROM users WHERE isPlatformAdmin = 1'),
  /** The account linked to a Hugging Face identity, if there is one. */
  byHfId: (hfId: string) => one<UserRow>('SELECT * FROM users WHERE hfId = ?', hfId),
  /** Login accepts either the username or the email address. */
  async byLogin(login: string) {
    const key = login.trim().toLowerCase();
    return await one<UserRow>('SELECT * FROM users WHERE username = ? OR email = ?', key, key);
  },
  count: () => count('SELECT COUNT(*) n FROM users'),
  async create(input: {
    email?: string | null; username: string; passwordHash: string; displayName: string;
    candidateRef?: string | null; isPlatformAdmin?: boolean; credits?: number;
    emailVerifiedAt?: string | null; hfId?: string | null; hfName?: string | null;
    avatarUrl?: string | null;
  }): Promise<UserRow> {
    const row: UserRow = {
      id: id(),
      email: input.email ? input.email.trim().toLowerCase() : null,
      username: input.username.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      candidateRef: input.candidateRef ?? null,
      isPlatformAdmin: input.isPlatformAdmin ? 1 : 0,
      credits: input.credits ?? 0,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      hfId: input.hfId ?? null,
      hfName: input.hfName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: now(),
    };
    await run(`INSERT INTO users (id, email, username, passwordHash, displayName, candidateRef,
                                 isPlatformAdmin, credits, emailVerifiedAt, hfId, hfName, avatarUrl, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.email, row.username, row.passwordHash, row.displayName,
      row.candidateRef, row.isPlatformAdmin, row.credits, row.emailVerifiedAt,
      row.hfId, row.hfName, row.avatarUrl, row.createdAt);
    return row;
  },
  async update(userId: string, patch: Partial<Omit<UserRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE users SET ${clause} WHERE id = ?`, ...values, userId);
    return users.byId(userId);
  },
  /**
   * Adds (or, with a negative delta, refunds) credits. `GREATEST` is the
   * Postgres spelling — the two-argument `MAX` this used to call is SQLite's,
   * and on Postgres it threw, which meant every credit movement failed.
   */
  async addCredits(userId: string, delta: number) {
    await run('UPDATE users SET credits = GREATEST(0, credits + ?) WHERE id = ?', delta, userId);
    return users.byId(userId);
  },
  /**
   * Takes credits only if they are there, in one statement.
   *
   * Checking the balance and then spending it are two statements, and two
   * requests can pass the check before either has spent — which is how one
   * credit buys two papers. Returning the updated row is how the caller knows
   * whether the spend actually happened.
   */
  async spendCredits(userId: string, amount: number): Promise<UserRow | null> {
    if (amount <= 0) return users.byId(userId);
    const rows = await all<UserRow>(
      'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ? RETURNING *',
      amount, userId, amount,
    );
    return rows[0] ?? null;
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
  async upsert(userId: string, orgId: string, role: OrgRole, cohort?: string | null): Promise<MembershipRow> {
    const existing = await memberships.find(userId, orgId);
    if (existing) {
      await run('UPDATE memberships SET role = ?, cohort = ? WHERE id = ?', role, cohort ?? existing.cohort, existing.id);
      return { ...existing, role, cohort: cohort ?? existing.cohort };
    }
    const row: MembershipRow = { id: id(), userId, orgId, role, cohort: cohort ?? null, createdAt: now() };
    await run(`INSERT INTO memberships (id, userId, orgId, role, cohort, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      row.id, row.userId, row.orgId, row.role, row.cohort, row.createdAt);
    return row;
  },
  remove: (membershipId: string) => run('DELETE FROM memberships WHERE id = ?', membershipId),
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

/**
 * What a list of papers needs to know without opening any of them: how many
 * questions the paper holds and whether it has a recording. Worked out where
 * the content is already in hand — on write — and stored in columns.
 */
export function paperStats(contentJson: string): {
  questionCount: number; hasAudio: number; summary: string | null; fingerprint: string | null;
} {
  try {
    const content = JSON.parse(contentJson) as {
      audioUrl?: string;
      description?: string;
      parts?: Array<{ audioUrl?: string; groups?: Array<{ questions?: unknown[] }> }>;
    };
    let questionCount = 0;
    let hasAudio = content.audioUrl ? 1 : 0;
    for (const part of content.parts ?? []) {
      if (part.audioUrl) hasAudio = 1;
      for (const group of part.groups ?? []) questionCount += (group.questions ?? []).length;
    }
    return {
      questionCount,
      hasAudio,
      summary: content.description?.trim() ? content.description.trim().slice(0, 300) : null,
      fingerprint: fingerprintOf(contentJson),
    };
  } catch {
    return { questionCount: 0, hasAudio: 0, summary: null, fingerprint: null };
  }
}

/**
 * A fingerprint of what a paper actually asks.
 *
 * Uploading the same book twice is the easiest mistake to make — a teacher is
 * not sure whether the first upload worked, so they try again, and forty
 * duplicate papers appear. Comparing titles would not catch it (a book's
 * papers are all called "Test 3") and comparing whole documents would not
 * either, because ids and marks differ between two parses of the same file. So
 * the fingerprint is taken over the question text alone, normalised.
 */
export function fingerprintOf(contentJson: string): string | null {
  try {
    const content = JSON.parse(contentJson) as {
      parts?: Array<{ groups?: Array<{ bodyHtml?: string; questions?: Array<{ number?: number; prompt?: string }> }> }>;
    };
    const bits: string[] = [];
    for (const part of content.parts ?? []) {
      for (const group of part.groups ?? []) {
        if (group.bodyHtml) bits.push(group.bodyHtml.replace(/<[^>]+>/g, ' '));
        for (const q of group.questions ?? []) bits.push(`${q.number}:${q.prompt ?? ''}`);
      }
    }
    const text = bits.join('\n').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.length < 40) return null;
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
  } catch {
    return null;
  }
}

/** Everything about a paper except the paper: what every list actually reads. */
const TEST_META = `id, orgId, title, module, variant, status, durationMin, visibility,
       priceCredits, bank, source, folder, shared, questionCount, hasAudio, summary,
       fingerprint, createdAt, updatedAt`;

export type TestMeta = Omit<TestRow, 'content'>;

export const tests = {
  listOrg: (orgId: string) => all<TestRow>('SELECT * FROM tests WHERE orgId = ? ORDER BY updatedAt DESC', orgId),
  /** The same list without the papers themselves: what every screen renders. */
  listOrgMeta: (orgId: string, limit = 1000) =>
    all<TestMeta>(
      `SELECT ${TEST_META} FROM tests WHERE orgId = ? ORDER BY updatedAt DESC LIMIT ?`, orgId, limit),
  /**
   * The papers screen, in one query: the metadata plus how many attempts each
   * paper has. It used to be a query per paper, against an unindexed column.
   */
  listOrgWithCounts: (orgId: string, limit = 1000) =>
    all<TestMeta & { attemptCount: number }>(
      `SELECT ${TEST_META.split(',').map((c) => `t.${c.trim()}`).join(', ')},
              COUNT(a.id) AS attemptCount
       FROM tests t LEFT JOIN attempts a ON a.testId = t.id
       WHERE t.orgId = ?
       GROUP BY t.id
       ORDER BY t.updatedAt DESC LIMIT ?`, orgId, limit),
  /** Just the content of one paper, for the places that really need it. */
  async contentOf(testId: string): Promise<string | null> {
    const row = await one<{ content: string }>('SELECT content FROM tests WHERE id = ?', testId);
    return row?.content ?? null;
  },
  /**
   * What an organisation's candidates may see listed. A sitting-only paper
   * opens with a code, and a paper set to `suite` is sat inside a full test —
   * neither belongs in a list of papers to pick from.
   */
  publishedOrg: (orgId: string, limit = 500) =>
    all<TestMeta>(
      `SELECT ${TEST_META} FROM tests WHERE orgId = ? AND status = 'published'
         AND visibility NOT IN ('sitting', 'suite')
       ORDER BY updatedAt DESC LIMIT ?`, orgId, limit),
  /**
   * The paper bank an organisation draws on to assemble a full test. Draft
   * papers are excluded — a paper nobody has finished is not one to hand a
   * candidate at random — as are papers with no questions in them.
   */
  bank: (orgId: string, module?: string) =>
    all<TestRow>(
      `SELECT * FROM tests WHERE orgId = ? AND bank = 1 AND status = 'published'
         ${module ? 'AND module = ?' : ''}
       ORDER BY updatedAt DESC`,
      ...(module ? [orgId, module] : [orgId])),
  bankCount: (orgId: string) => count('SELECT COUNT(*) n FROM tests WHERE orgId = ? AND bank = 1', orgId),
  /**
   * The bank as the bank screen shows it: metadata only, with how many times
   * each paper has been sat, so a school can see which of four hundred papers
   * are actually being used. No paper JSON — a bank of four hundred would be
   * tens of megabytes of it.
   */
  bankMeta: (orgId: string, limit = 2000) =>
    all<TestMeta & { attemptCount: number }>(
      `SELECT ${TEST_META.split(',').map((c) => `t.${c.trim()}`).join(', ')},
              COUNT(a.id) AS attemptCount
       FROM tests t LEFT JOIN attempts a ON a.testId = t.id
       WHERE t.orgId = ? AND t.bank = 1
       GROUP BY t.id
       ORDER BY COALESCE(t.folder, ''), t.title LIMIT ?`, orgId, limit),
  /**
   * The Testora library: papers their owner has opened to every organisation on
   * the platform. A school copies what it wants into its own bank rather than
   * pointing at somebody else's row, so the copy is theirs to edit — and a
   * paper being withdrawn from the library cannot take a school's results with
   * it.
   */
  library: (limit = 500) =>
    all<TestMeta & { ownerName: string }>(
      `SELECT ${TEST_META.split(',').map((c) => `t.${c.trim()}`).join(', ')}, o.name AS ownerName
       FROM tests t JOIN organizations o ON o.id = t.orgId
       WHERE t.shared = 1 AND t.status = 'published'
       ORDER BY COALESCE(t.folder, ''), t.title LIMIT ?`, limit),
  /** The library rows a school has already copied, without reading any paper. */
  copiedSources: (orgId: string) =>
    all<{ source: string }>(
      "SELECT source FROM tests WHERE orgId = ? AND source IS NOT NULL", orgId),
  /** The paper in this organisation that asks the same questions, if there is one. */
  byFingerprint: (orgId: string, fingerprint: string) =>
    one<TestMeta>(
      `SELECT ${TEST_META} FROM tests WHERE orgId = ? AND fingerprint = ? LIMIT 1`, orgId, fingerprint),
  /**
   * Bulk edit, for a bank that arrived forty papers at a time. The
   * organisation is part of the condition, so a stray id from another tenant
   * changes nothing rather than being taken on trust.
   */
  async bulkUpdate(orgId: string, ids: string[], patch: Partial<Pick<TestRow,
    'status' | 'visibility' | 'bank' | 'folder' | 'priceCredits'>>): Promise<number> {
    if (!ids.length) return 0;
    const { clause, values } = setters(patch);
    if (!clause) return 0;
    const rows = await all<{ id: string }>(
      `UPDATE tests SET ${clause}, updatedAt = ?
       WHERE orgId = ? AND id IN (${ids.map(() => '?').join(',')}) RETURNING id`,
      ...values, now(), orgId, ...ids,
    );
    return rows.length;
  },
  async bulkRemove(orgId: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await all<{ id: string }>(
      `DELETE FROM tests WHERE orgId = ? AND id IN (${ids.map(() => '?').join(',')}) RETURNING id`,
      orgId, ...ids,
    );
    return rows.length;
  },
  /** How many attempts each of these papers has, in one query. */
  attemptCountsFor: (ids: string[]) =>
    ids.length
      ? all<{ testId: string; n: number }>(
        `SELECT testId, COUNT(*) n FROM attempts WHERE testId IN (${ids.map(() => '?').join(',')})
         GROUP BY testId`, ...ids)
      : Promise.resolve([]),
  /** Whole papers by id, for the few places that need more than one at a time. */
  byIds: (ids: string[]) =>
    ids.length
      ? all<TestRow>(`SELECT * FROM tests WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      : Promise.resolve([]),
  /** Titles only, for a full test's section list. */
  titlesOf: (ids: string[]) =>
    ids.length
      ? all<{ id: string; title: string }>(
        `SELECT id, title FROM tests WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      : Promise.resolve([]),
  libraryCount: () => count("SELECT COUNT(*) n FROM tests WHERE shared = 1 AND status = 'published'"),
  /** The folders in use in one organisation, with how many papers are in each. */
  folders: (orgId: string) =>
    all<{ folder: string | null; n: number }>(
      `SELECT folder, COUNT(*) n FROM tests WHERE orgId = ?
       GROUP BY folder ORDER BY COALESCE(folder, '')`, orgId),
  catalogue: (limit = 500) =>
    all<TestMeta>(
      `SELECT ${TEST_META} FROM tests WHERE visibility = 'catalog' AND status = 'published'
       ORDER BY updatedAt DESC LIMIT ?`, limit),
  byId: (testId: string) => one<TestRow>('SELECT * FROM tests WHERE id = ?', testId),
  byTitle: (orgId: string, title: string) =>
    one<TestRow>('SELECT * FROM tests WHERE orgId = ? AND title = ?', orgId, title),
  count: (orgId?: string, status?: string) => {
    if (orgId && status) return count('SELECT COUNT(*) n FROM tests WHERE orgId = ? AND status = ?', orgId, status);
    if (orgId) return count('SELECT COUNT(*) n FROM tests WHERE orgId = ?', orgId);
    return count('SELECT COUNT(*) n FROM tests');
  },
  attemptCount: (testId: string) => count('SELECT COUNT(*) n FROM attempts WHERE testId = ?', testId),
  async create(input: {
    orgId: string; title: string; module: string; variant: string; status: string;
    durationMin: number; content: string; visibility?: string; priceCredits?: number;
    bank?: boolean; source?: string | null; folder?: string | null; shared?: boolean;
  }): Promise<TestRow> {
    const t = now();
    const { bank, source, folder, shared, ...rest } = input;
    const stats = paperStats(input.content);
    const row = {
      id: id(), priceCredits: 0, ...rest, ...stats,
      // `...rest` may carry an explicit undefined, which would insert a null
      // into a column that does not take one.
      visibility: rest.visibility ?? 'private',
      bank: bank ? 1 : 0, source: source ?? null, folder: folder ?? null,
      shared: shared ? 1 : 0, createdAt: t, updatedAt: t,
    } as TestRow;
    await run(`INSERT INTO tests (id, orgId, title, module, variant, status, durationMin, content, visibility, priceCredits, bank, source, folder, shared, questionCount, hasAudio, summary, fingerprint, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.title, row.module, row.variant, row.status, row.durationMin,
      row.content, row.visibility, row.priceCredits, row.bank, row.source, row.folder,
      row.shared, row.questionCount, row.hasAudio, row.summary, row.fingerprint,
      row.createdAt, row.updatedAt);
    return row;
  },
  async update(testId: string, patch: Partial<Omit<TestRow, 'id' | 'createdAt'>>) {
    // The cached counts are part of the content: change one, recount the other.
    const full = typeof patch.content === 'string'
      ? { ...patch, ...paperStats(patch.content) }
      : patch;
    const { clause, values } = setters(full);
    if (clause) await run(`UPDATE tests SET ${clause}, updatedAt = ? WHERE id = ?`, ...values, now(), testId);
    return tests.byId(testId);
  },
  remove: (testId: string) => run('DELETE FROM tests WHERE id = ?', testId),
};

/* ------------------------------------------------------------------ */
/* Sittings                                                            */
/* ------------------------------------------------------------------ */

export interface SessionWithTest extends ExamSessionRow {
  /** Null when the sitting is for a full test rather than a single paper. */
  testTitle: string | null;
  testModule: string | null;
  suiteTitle: string | null;
}

/** What a sitting opens: one paper, or a full test sat skill by skill. */
const SITTING_SELECT = `SELECT s.*, t.title AS testTitle, t.module AS testModule, u.title AS suiteTitle
       FROM exam_sessions s
       LEFT JOIN tests t ON t.id = s.testId
       LEFT JOIN suites u ON u.id = s.suiteId`;

export const sittings = {
  listOrg: (orgId: string) =>
    all<SessionWithTest>(`${SITTING_SELECT} WHERE s.orgId = ? ORDER BY s.createdAt DESC`, orgId),
  /** How many attempts each of an organisation's sittings has, in one query. */
  attemptCounts: (orgId: string) =>
    all<{ sessionId: string; n: number }>(
      `SELECT s.id AS sessionId, COUNT(a.id) AS n
       FROM exam_sessions s LEFT JOIN attempts a ON a.sessionId = s.id
       WHERE s.orgId = ? GROUP BY s.id`, orgId),
  byId: (sessionId: string) =>
    one<SessionWithTest>(`${SITTING_SELECT} WHERE s.id = ?`, sessionId),
  byCode: (code: string) =>
    one<SessionWithTest>(`${SITTING_SELECT} WHERE s.accessCode = ?`, code.trim().toUpperCase()),
  /** Sittings scheduled for one full test, newest first. */
  forSuite: (suiteId: string) =>
    all<SessionWithTest>(`${SITTING_SELECT} WHERE s.suiteId = ? ORDER BY s.createdAt DESC`, suiteId),
  attemptCount: (sessionId: string) => count('SELECT COUNT(*) n FROM attempts WHERE sessionId = ?', sessionId),
  async create(input: {
    orgId: string; testId?: string | null; suiteId?: string | null; name: string;
    opensAt?: string | null; closesAt?: string | null;
    durationMin?: number; settings?: Partial<typeof DEFAULT_SESSION_SETTINGS>; accessCode?: string;
  }): Promise<ExamSessionRow> {
    let code = (input.accessCode || shortCode()).toUpperCase();
    while (await sittings.byCode(code)) code = shortCode();
    const row: ExamSessionRow = {
      id: id(), orgId: input.orgId, testId: input.testId ?? null, suiteId: input.suiteId ?? null,
      name: input.name, accessCode: code,
      opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null,
      durationMin: input.durationMin ?? 0, status: 'scheduled',
      settings: JSON.stringify({ ...DEFAULT_SESSION_SETTINGS, ...input.settings }), createdAt: now(),
    };
    await run(`INSERT INTO exam_sessions (id, orgId, testId, suiteId, name, accessCode, opensAt, closesAt, durationMin, status, settings, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.testId, row.suiteId, row.name, row.accessCode, row.opensAt, row.closesAt,
      row.durationMin, row.status, row.settings, row.createdAt);
    return row;
  },
  async update(sessionId: string, patch: Partial<Omit<ExamSessionRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE exam_sessions SET ${clause} WHERE id = ?`, ...values, sessionId);
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
  /**
   * Just enough of an attempt to decide whether this request may touch it.
   *
   * `byId` carries the whole paper — a JSON document of tens of kilobytes —
   * because the pages that render an exam need it. The autosave runs about once
   * a second per candidate and the invigilation trail fires on every focus
   * change; those only need to know who owns the attempt and whether it is
   * still open, so they read this instead. With two hundred candidates in a
   * sitting that is the difference between a few kilobytes a second and ten
   * megabytes a second through a pool that holds one connection.
   */
  guard: (attemptId: string) =>
    one<Pick<AttemptRow, 'id' | 'userId' | 'orgId' | 'testId' | 'status' | 'endsAt' | 'startedAt' | 'sessionId' | 'untimed'>>(
      `SELECT id, userId, orgId, testId, status, endsAt, startedAt, sessionId, untimed
       FROM attempts WHERE id = ?`, attemptId),
  listOrg: (orgId: string, limit = 200) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.orgId = ? ORDER BY a.startedAt DESC LIMIT ?`, orgId, limit),
  listSession: (sessionId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.sessionId = ? ORDER BY a.startedAt DESC`, sessionId),
  /**
   * The room, without the papers.
   *
   * The invigilation monitor is the one screen refreshed while an exam is
   * actually running, and it shows names, clocks and flags — not questions. The
   * full read attaches the paper to every row, so a sitting of three hundred
   * used to move a few hundred megabytes every time somebody watching it hit
   * refresh.
   */
  roster: (sessionId: string) =>
    all<Omit<AttemptWithRefs, 'testContent'>>(
      `SELECT a.id, a.orgId, a.testId, a.sessionId, a.userId, a.status, a.startedAt, a.endsAt,
              a.submittedAt, a.rawScore, a.manualScore, a.band, a.suiteId, a.skill, a.mode,
              a.untimed, a.createdAt, a.flags, a.report,
              t.title AS testTitle, t.module AS testModule, t.variant AS testVariant,
              u.displayName AS candidateName, u.candidateRef AS candidateRef, u.email AS candidateEmail,
              s.name AS sessionName, o.slug AS orgSlug, o.name AS orgName
       FROM attempts a
       JOIN tests t ON t.id = a.testId
       JOIN users u ON u.id = a.userId
       JOIN organizations o ON o.id = a.orgId
       LEFT JOIN exam_sessions s ON s.id = a.sessionId
       WHERE a.sessionId = ? ORDER BY a.startedAt DESC`, sessionId),
  listForUser: (userId: string, limit = 30) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.userId = ? ORDER BY a.startedAt DESC LIMIT ?`, userId, limit),
  listForTest: (testId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.testId = ? ORDER BY a.startedAt DESC`, testId),
  awaitingMarking: (orgId: string, limit = 200) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.orgId = ? AND a.status IN ('submitted','marking')
                          ORDER BY a.submittedAt ASC LIMIT ?`, orgId, limit),
  /**
   * The report screen's rows: everything that has been sat, with the paper's
   * title and total but not the paper. The old shape read every attempt with
   * its paper attached and every paper in the organisation as well — a
   * thousand attempts over three hundred papers meant thirteen hundred large
   * JSON documents in one request, which timed the page out long before a
   * school reached that size.
   */
  finished: (orgId: string, limit = 2000) =>
    all<Omit<AttemptWithRefs, 'testContent'> & { testQuestionCount: number | null }>(
      `SELECT a.id, a.orgId, a.testId, a.sessionId, a.userId, a.status, a.startedAt, a.endsAt,
              a.submittedAt, a.rawScore, a.manualScore, a.band, a.report, a.suiteId, a.skill,
              a.mode, a.untimed, a.createdAt, a.answers, a.annotations, a.flags,
              t.title AS testTitle, t.module AS testModule, t.variant AS testVariant,
              t.questionCount AS testQuestionCount,
              u.displayName AS candidateName, u.candidateRef AS candidateRef, u.email AS candidateEmail,
              s.name AS sessionName, o.slug AS orgSlug, o.name AS orgName
       FROM attempts a
       JOIN tests t ON t.id = a.testId
       JOIN users u ON u.id = a.userId
       JOIN organizations o ON o.id = a.orgId
       LEFT JOIN exam_sessions s ON s.id = a.sessionId
       WHERE a.orgId = ? AND a.status <> 'in_progress'
       ORDER BY a.submittedAt DESC NULLS LAST LIMIT ?`, orgId, limit),
  /** Has this candidate already handed in something in this sitting? */
  finishedInSession: (sessionId: string, userId: string) =>
    one<{ id: string }>(
      `SELECT id FROM attempts WHERE sessionId = ? AND userId = ? AND status <> 'in_progress' LIMIT 1`,
      sessionId, userId),
  activeFor: (testId: string, userId: string) =>
    one<AttemptRow>(`SELECT * FROM attempts WHERE testId = ? AND userId = ? AND status = 'in_progress'
                     ORDER BY startedAt DESC LIMIT 1`, testId, userId),
  count: (orgId?: string) =>
    orgId ? count('SELECT COUNT(*) n FROM attempts WHERE orgId = ?', orgId)
          : count('SELECT COUNT(*) n FROM attempts'),
  listForSuite: (suiteId: string, userId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.suiteId = ? AND a.userId = ? ORDER BY a.startedAt`, suiteId, userId),
  suiteRoster: (suiteId: string) =>
    all<AttemptWithRefs>(`${ATTEMPT_JOIN} WHERE a.suiteId = ? ORDER BY a.startedAt DESC`, suiteId),
  async create(input: {
    orgId: string; testId: string; userId: string; endsAt: string;
    sessionId?: string | null; suiteId?: string | null; skill?: string | null;
    /** True when the paper is sat with no clock; `endsAt` is then nominal. */
    untimed?: boolean;
    /** 'practice' is the candidate's own rehearsal and stays out of the report. */
    mode?: 'exam' | 'practice';
  }): Promise<AttemptRow> {
    const row: AttemptRow = {
      id: id(), orgId: input.orgId, testId: input.testId, sessionId: input.sessionId ?? null,
      suiteId: input.suiteId ?? null, skill: input.skill ?? null,
      userId: input.userId, status: 'in_progress', startedAt: now(), endsAt: input.endsAt,
      untimed: input.untimed ? 1 : 0, mode: input.mode ?? 'exam',
      submittedAt: null, answers: '{}', annotations: '[]', flags: '[]',
      rawScore: null, manualScore: null, band: null, report: null, createdAt: now(),
    };
    await run(`INSERT INTO attempts (id, orgId, testId, sessionId, suiteId, skill, userId, status, startedAt, endsAt, untimed, mode, answers, annotations, flags, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.testId, row.sessionId, row.suiteId, row.skill, row.userId, row.status,
      row.startedAt, row.endsAt, row.untimed, row.mode, row.answers, row.annotations, row.flags, row.createdAt);
    return row;
  },
  async update(attemptId: string, patch: Partial<Omit<AttemptRow, 'id'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE attempts SET ${clause} WHERE id = ?`, ...values, attemptId);
  },
  remove: (attemptId: string) => run('DELETE FROM attempts WHERE id = ?', attemptId),
};

export const events = {
  async add(attemptId: string, type: string, meta: Record<string, unknown> = {}) {
    await run('INSERT INTO attempt_events (id, attemptId, type, at, meta) VALUES (?, ?, ?, ?, ?)',
      id(), attemptId, type, now(), JSON.stringify(meta));
  },
  list: (attemptId: string, limit = 500) =>
    all<AttemptEventRow>(
      'SELECT * FROM attempt_events WHERE attemptId = ? ORDER BY at LIMIT ?', attemptId, limit),
  /** One kind of event only — the exam page wants the recording markers. */
  ofType: (attemptId: string, type: string) =>
    all<AttemptEventRow>(
      'SELECT * FROM attempt_events WHERE attemptId = ? AND type = ? ORDER BY at', attemptId, type),
  countByType: (attemptId: string) =>
    all<{ type: string; n: number }>(
      'SELECT type, COUNT(*) n FROM attempt_events WHERE attemptId = ? GROUP BY type', attemptId),
  /**
   * The whole invigilation trail of one sitting, counted in the database.
   *
   * The monitor screen used to ask twice per candidate — once for the events
   * themselves, only to count them, and once for the counts by type. In a room
   * of three hundred that was six hundred queries and every event row's
   * payload, to render a table of numbers.
   */
  countsForSession: (sessionId: string) =>
    all<{ attemptId: string; type: string; n: number }>(
      `SELECT e.attemptId AS attemptId, e.type AS type, COUNT(*) AS n
       FROM attempt_events e JOIN attempts a ON a.id = e.attemptId
       WHERE a.sessionId = ?
       GROUP BY e.attemptId, e.type`, sessionId),
};

/* ------------------------------------------------------------------ */
/* Marking                                                             */
/* ------------------------------------------------------------------ */

export const rubrics = {
  listOrg: (orgId: string) => all<RubricRow>('SELECT * FROM rubrics WHERE orgId = ? ORDER BY name', orgId),
  byId: (rubricId: string) => one<RubricRow>('SELECT * FROM rubrics WHERE id = ?', rubricId),
  async create(input: { orgId: string; name: string; criteria: string }): Promise<RubricRow> {
    const row: RubricRow = { id: id(), ...input, createdAt: now() };
    await run('INSERT INTO rubrics (id, orgId, name, criteria, createdAt) VALUES (?, ?, ?, ?, ?)',
      row.id, row.orgId, row.name, row.criteria, row.createdAt);
    return row;
  },
  async update(rubricId: string, patch: Partial<Omit<RubricRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE rubrics SET ${clause} WHERE id = ?`, ...values, rubricId);
    return rubrics.byId(rubricId);
  },
  remove: (rubricId: string) => run('DELETE FROM rubrics WHERE id = ?', rubricId),
};

export const markings = {
  forAttempt: (attemptId: string) =>
    all<MarkingRow>('SELECT * FROM markings WHERE attemptId = ?', attemptId),
  /**
   * Records the mark for one question of one attempt.
   *
   * Update first, insert only if there was nothing to update, and if that
   * insert loses a race with another marker, update what they wrote instead.
   * Reading first and then deciding — which is what this did — left two rows
   * whenever a human and the model marked the same essay at the same moment,
   * and the score is the sum of the rows.
   */
  async save(input: {
    attemptId: string; questionId: string; markerId: string | null; rubricId?: string | null;
    scores: string; comment: string; awarded: number;
    source?: 'human' | 'ai'; feedback?: string;
  }) {
    const update = () => all<{ id: string }>(
      `UPDATE markings SET markerId = ?, rubricId = ?, scores = ?, comment = ?, awarded = ?,
              source = ?, feedback = ?
       WHERE attemptId = ? AND questionId = ? RETURNING id`,
      input.markerId, input.rubricId ?? null, input.scores, input.comment, input.awarded,
      input.source ?? 'human', input.feedback ?? '{}', input.attemptId, input.questionId,
    );

    if ((await update()).length) return;
    try {
      await run(`INSERT INTO markings (id, attemptId, questionId, markerId, rubricId, scores, comment, awarded, source, feedback, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id(), input.attemptId, input.questionId, input.markerId, input.rubricId ?? null,
        input.scores, input.comment, input.awarded, input.source ?? 'human', input.feedback ?? '{}', now());
    } catch {
      // Somebody inserted the same mark first; theirs is the row to change.
      await update();
    }
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
  async create(input: {
    orgId?: string | null; testId?: string | null; credits?: number; maxUses?: number;
    expiresAt?: string | null; note?: string; code?: string;
  }): Promise<AccessCodeRow> {
    let code = (input.code || `EX-${shortCode(8)}`).toUpperCase();
    while (await accessCodes.byCode(code)) code = `EX-${shortCode(8)}`;
    const row: AccessCodeRow = {
      id: id(), code, orgId: input.orgId ?? null, testId: input.testId ?? null,
      credits: input.credits ?? 1, maxUses: input.maxUses ?? 1, usedCount: 0,
      expiresAt: input.expiresAt ?? null, note: input.note ?? '', createdAt: now(),
    };
    await run(`INSERT INTO access_codes (id, code, orgId, testId, credits, maxUses, usedCount, expiresAt, note, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.code, row.orgId, row.testId, row.credits, row.maxUses, row.usedCount,
      row.expiresAt, row.note, row.createdAt);
    return row;
  },
  /**
   * Claims one use of a code, and says whether the claim succeeded.
   *
   * The count and the limit are compared inside the same statement that does
   * the increment, because checking first and incrementing afterwards lets two
   * simultaneous redemptions of a one-use code both pass the check. A code with
   * `maxUses = 0` is unlimited, which is why the limit is only applied when it
   * is set.
   */
  async claim(codeId: string): Promise<boolean> {
    const rows = await all<{ id: string }>(
      `UPDATE access_codes SET usedCount = usedCount + 1
       WHERE id = ? AND (maxUses <= 0 OR usedCount < maxUses)
       RETURNING id`, codeId,
    );
    return rows.length > 0;
  },
  async consume(codeId: string) { await accessCodes.claim(codeId); },
  remove: (codeId: string) => run('DELETE FROM access_codes WHERE id = ?', codeId),
};

export const orders = {
  listForUser: (userId: string) =>
    all<OrderRow>('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC', userId),
  listAll: (limit = 200) => all<OrderRow>('SELECT * FROM orders ORDER BY createdAt DESC LIMIT ?', limit),
  byId: (orderId: string) => one<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId),
  async create(input: {
    userId: string; orgId?: string | null; description: string; amountMinor: number;
    currency?: string; credits: number; provider: string; reference?: string | null;
  }): Promise<OrderRow> {
    const row: OrderRow = {
      id: id(), userId: input.userId, orgId: input.orgId ?? null, description: input.description,
      amountMinor: input.amountMinor, currency: input.currency ?? 'VND', credits: input.credits,
      provider: input.provider, status: 'pending', reference: input.reference ?? null, createdAt: now(),
    };
    await run(`INSERT INTO orders (id, userId, orgId, description, amountMinor, currency, credits, provider, status, reference, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.userId, row.orgId, row.description, row.amountMinor, row.currency,
      row.credits, row.provider, row.status, row.reference, row.createdAt);
    return row;
  },
  async setStatus(orderId: string, status: OrderRow['status'], reference?: string) {
    await run('UPDATE orders SET status = ?, reference = COALESCE(?, reference) WHERE id = ?', status, reference ?? null, orderId);
  },
};

/* ------------------------------------------------------------------ */
/* Platform settings                                                   */
/* ------------------------------------------------------------------ */

export interface VerificationRow {
  id: string; userId: string; email: string; code: string; purpose: string;
  attempts: number; expiresAt: string; usedAt: string | null; createdAt: string;
}

export const verifications = {
  /** The newest live code for this account, if there is one. */
  latest: (userId: string, purpose = 'verify-email') =>
    one<VerificationRow>(
      `SELECT * FROM verification_codes
       WHERE userId = ? AND purpose = ? AND usedAt IS NULL
       ORDER BY createdAt DESC LIMIT 1`, userId, purpose),
  async issue(input: { userId: string; email: string; code: string; purpose?: string; ttlMinutes?: number }) {
    // One live code per account: asking for a new one retires the old.
    await run("UPDATE verification_codes SET usedAt = ? WHERE userId = ? AND purpose = ? AND usedAt IS NULL",
      now(), input.userId, input.purpose ?? 'verify-email');
    const row: VerificationRow = {
      id: id(), userId: input.userId, email: input.email.trim().toLowerCase(), code: input.code,
      purpose: input.purpose ?? 'verify-email', attempts: 0,
      expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 20) * 60_000).toISOString(),
      usedAt: null, createdAt: now(),
    };
    await run(`INSERT INTO verification_codes (id, userId, email, code, purpose, attempts, expiresAt, usedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.userId, row.email, row.code, row.purpose, row.attempts,
      row.expiresAt, row.usedAt, row.createdAt);
    return row;
  },
  countAttempt: (codeId: string) =>
    run('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?', codeId),
  consume: (codeId: string) => run('UPDATE verification_codes SET usedAt = ? WHERE id = ?', now(), codeId),
};

/* ------------------------------------------------------------------ */
/* AI usage                                                            */
/* ------------------------------------------------------------------ */

export interface AiUsageRow {
  id: string; orgId: string | null; userId: string | null; feature: string;
  provider: string; model: string; inputTokens: number; outputTokens: number;
  costMicros: number; ok: number; meta: string; createdAt: string;
}

export const aiUsage = {
  async record(input: {
    orgId?: string | null; userId?: string | null; feature: string; provider: string; model: string;
    inputTokens?: number; outputTokens?: number; costMicros?: number; ok?: boolean;
    meta?: Record<string, unknown>;
  }) {
    await run(`INSERT INTO ai_usage (id, orgId, userId, feature, provider, model, inputTokens, outputTokens, costMicros, ok, meta, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id(), input.orgId ?? null, input.userId ?? null, input.feature, input.provider, input.model,
      input.inputTokens ?? 0, input.outputTokens ?? 0, input.costMicros ?? 0,
      input.ok === false ? 0 : 1, JSON.stringify(input.meta ?? {}), now());
  },
  listOrg: (orgId: string, limit = 200) =>
    all<AiUsageRow>('SELECT * FROM ai_usage WHERE orgId = ? ORDER BY createdAt DESC LIMIT ?', orgId, limit),
  listAll: (limit = 500) => all<AiUsageRow>('SELECT * FROM ai_usage ORDER BY createdAt DESC LIMIT ?', limit),
  /** Per-organisation totals, newest month first. */
  /**
   * Per-organisation totals, dearest first. `orgId` narrows it in the database:
   * a school's own usage screen used to group the whole platform's history and
   * then throw all but its own rows away in JavaScript.
   */
  summary: (since?: string, orgId?: string) => all<{
    orgId: string | null; orgName: string | null; feature: string; calls: number;
    inputTokens: number; outputTokens: number; costMicros: number;
  }>(
    // Postgres insists every selected column is grouped or aggregated, so the
    // organisation's name is grouped too rather than picked up incidentally.
    `SELECT u.orgId, o.name AS orgName, u.feature, COUNT(*) AS calls,
            COALESCE(SUM(u.inputTokens), 0) AS inputTokens,
            COALESCE(SUM(u.outputTokens), 0) AS outputTokens,
            COALESCE(SUM(u.costMicros), 0) AS costMicros
     FROM ai_usage u LEFT JOIN organizations o ON o.id = u.orgId
     ${[since ? 'u.createdAt >= ?' : '', orgId ? 'u.orgId = ?' : ''].filter(Boolean).length
       ? `WHERE ${[since ? 'u.createdAt >= ?' : '', orgId ? 'u.orgId = ?' : ''].filter(Boolean).join(' AND ')}`
       : ''}
     GROUP BY u.orgId, o.name, u.feature
     ORDER BY COALESCE(SUM(u.costMicros), 0) DESC`,
    ...[...(since ? [since] : []), ...(orgId ? [orgId] : [])],
  ),
  totals: (orgId?: string) => one<{ calls: number; inputTokens: number; outputTokens: number; costMicros: number }>(
    `SELECT COUNT(*) AS calls, COALESCE(SUM(inputTokens),0) AS inputTokens,
            COALESCE(SUM(outputTokens),0) AS outputTokens, COALESCE(SUM(costMicros),0) AS costMicros
     FROM ai_usage ${orgId ? 'WHERE orgId = ?' : ''}`,
    ...(orgId ? [orgId] : []),
  ),
};

/* ------------------------------------------------------------------ */
/* Applications for an organisation of one's own                       */
/* ------------------------------------------------------------------ */

export interface OrgApplicationRow {
  id: string;
  orgName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  reason: string;
  candidates: string;
  website: string;
  status: 'pending' | 'approved' | 'declined';
  note: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  orgId: string | null;
  createdAt: string;
}

export const orgApplications = {
  list: (status?: string, limit = 100) =>
    all<OrgApplicationRow>(
      `SELECT * FROM org_applications ${status ? 'WHERE status = ?' : ''} ORDER BY createdAt DESC LIMIT ?`,
      ...(status ? [status, limit] : [limit]),
    ),
  byId: (applicationId: string) =>
    one<OrgApplicationRow>('SELECT * FROM org_applications WHERE id = ?', applicationId),
  pendingCount: () => count("SELECT COUNT(*) n FROM org_applications WHERE status = 'pending'"),
  /** One pending application per email, so a double submission is not two rows. */
  pendingFor: (email: string) =>
    one<OrgApplicationRow>(
      "SELECT * FROM org_applications WHERE lower(contactEmail) = lower(?) AND status = 'pending'",
      email,
    ),
  /** How many an address has sent recently, so the form cannot be used as a firehose. */
  recentFor: (email: string, sinceIso: string) =>
    count('SELECT COUNT(*) n FROM org_applications WHERE lower(contactEmail) = lower(?) AND createdAt >= ?',
      email, sinceIso),
  async create(input: {
    orgName: string; contactName: string; contactEmail: string; contactPhone: string;
    reason: string; candidates?: string; website?: string;
  }): Promise<OrgApplicationRow> {
    const row: OrgApplicationRow = {
      id: id(),
      orgName: input.orgName,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      reason: input.reason,
      candidates: input.candidates ?? '',
      website: input.website ?? '',
      status: 'pending',
      note: '',
      reviewedBy: null,
      reviewedAt: null,
      orgId: null,
      createdAt: now(),
    };
    await run(`INSERT INTO org_applications
        (id, orgName, contactName, contactEmail, contactPhone, reason, candidates, website, status, note, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgName, row.contactName, row.contactEmail, row.contactPhone, row.reason,
      row.candidates, row.website, row.status, row.note, row.createdAt);
    return row;
  },
  async update(applicationId: string, patch: Partial<Omit<OrgApplicationRow, 'id'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE org_applications SET ${clause} WHERE id = ?`, ...values, applicationId);
    return orgApplications.byId(applicationId);
  },
  remove: (applicationId: string) => run('DELETE FROM org_applications WHERE id = ?', applicationId),
};

/* ------------------------------------------------------------------ */
/* Suites — a multi-skill exam such as a full IELTS sitting            */
/* ------------------------------------------------------------------ */

export type SkillName = 'listening' | 'reading' | 'writing' | 'speaking';

export interface SuiteItem {
  skill: SkillName;
  testId: string | null;
  durationMin: number;
  videoUrl?: string;
  /** `online` is sat here; `offline` is entered by a member of staff. */
  mode: 'online' | 'offline';
}

export interface SuiteRow {
  id: string; orgId: string; title: string; kind: string; description: string;
  status: string; visibility: string; priceCredits: number; items: string;
  /** JSON: see `SuiteSettings`. */
  settings: string;
  /** The folder it is filed under, shown to staff and candidates. */
  folder: string | null;
  /** The candidate this test was drawn for, when it was drawn for one. */
  assembledFor: string | null;
  createdAt: string; updatedAt: string;
}

/** How a full test may be sat, and where it came from. */
export interface SuiteSettings {
  /** Sections may be sat one at a time, at a length the candidate picks. */
  allowPractice: boolean;
  /** The whole test may be sat properly, in order and to the official timings. */
  allowSimulation: boolean;
  /** The longest a practice section may run, in minutes. 0 means no cap. */
  practiceMaxMinutes: number;
  /** Set when the test was drawn at random for one candidate. */
  assembledFor?: string | null;
  /** The bank draw that produced it, so a centre can tell them apart. */
  assembledAt?: string | null;
}

export const SUITE_DEFAULTS: SuiteSettings = {
  allowPractice: true,
  allowSimulation: true,
  practiceMaxMinutes: 0,
};

export function suiteSettingsOf(row: Pick<SuiteRow, 'settings'>): SuiteSettings {
  try {
    return { ...SUITE_DEFAULTS, ...(JSON.parse(row.settings || '{}') as Partial<SuiteSettings>) };
  } catch {
    return { ...SUITE_DEFAULTS };
  }
}

export const suites = {
  listOrg: (orgId: string) => all<SuiteRow>('SELECT * FROM suites WHERE orgId = ? ORDER BY updatedAt DESC', orgId),
  /**
   * The full tests one candidate may see in an organisation. A test drawn at
   * random for somebody else is theirs, not everyone's, so it is left out
   * unless the candidate asking is the one it was drawn for.
   */
  publishedOrg: (orgId: string, userId?: string) =>
    all<SuiteRow>(
      `SELECT * FROM suites WHERE orgId = ? AND status = 'published'
         AND (assembledFor IS NULL ${userId ? 'OR assembledFor = ?' : ''})
       ORDER BY updatedAt DESC`,
      ...(userId ? [orgId, userId] : [orgId])),
  catalogue: () =>
    all<SuiteRow>(
      `SELECT * FROM suites WHERE visibility = 'catalog' AND status = 'published'
         AND assembledFor IS NULL
       ORDER BY updatedAt DESC`),
  byId: (suiteId: string) => one<SuiteRow>('SELECT * FROM suites WHERE id = ?', suiteId),
  byTitle: (orgId: string, title: string) =>
    one<SuiteRow>('SELECT * FROM suites WHERE orgId = ? AND title = ?', orgId, title),
  /** Full tests drawn at random for one candidate, newest first. */
  assembledFor: (userId: string) =>
    all<SuiteRow>(
      'SELECT * FROM suites WHERE assembledFor = ? ORDER BY createdAt DESC LIMIT 20',
      userId),
  async create(input: {
    orgId: string; title: string; kind?: string; description?: string; status?: string;
    visibility?: string; priceCredits?: number; items: SuiteItem[];
    settings?: Partial<SuiteSettings>; folder?: string | null;
  }): Promise<SuiteRow> {
    const t = now();
    const row: SuiteRow = {
      id: id(), orgId: input.orgId, title: input.title, kind: input.kind ?? 'ielts',
      description: input.description ?? '', status: input.status ?? 'draft',
      visibility: input.visibility ?? 'private', priceCredits: input.priceCredits ?? 0,
      items: JSON.stringify(input.items),
      settings: JSON.stringify({ ...SUITE_DEFAULTS, ...(input.settings ?? {}) }),
      folder: input.folder ?? null,
      assembledFor: input.settings?.assembledFor ?? null,
      createdAt: t, updatedAt: t,
    };
    await run(`INSERT INTO suites (id, orgId, title, kind, description, status, visibility, priceCredits, items, settings, folder, assembledFor, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.title, row.kind, row.description, row.status,
      row.visibility, row.priceCredits, row.items, row.settings, row.folder,
      row.assembledFor, row.createdAt, row.updatedAt);
    return row;
  },
  async update(suiteId: string, patch: Partial<Omit<SuiteRow, 'id' | 'createdAt'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE suites SET ${clause}, updatedAt = ? WHERE id = ?`, ...values, now(), suiteId);
    return suites.byId(suiteId);
  },
  attemptCount: (suiteId: string) => count('SELECT COUNT(*) n FROM attempts WHERE suiteId = ?', suiteId),
  remove: (suiteId: string) => run('DELETE FROM suites WHERE id = ?', suiteId),
  itemsOf(row: SuiteRow): SuiteItem[] {
    try { return JSON.parse(row.items) as SuiteItem[]; } catch { return []; }
  },
};

export interface SuiteResultRow {
  id: string; suiteId: string; userId: string; manualBands: string; releasedAt: string | null;
}

export const suiteResults = {
  find: (suiteId: string, userId: string) =>
    one<SuiteResultRow>('SELECT * FROM suite_results WHERE suiteId = ? AND userId = ?', suiteId, userId),
  listSuite: (suiteId: string) =>
    all<SuiteResultRow & { candidateName: string; candidateRef: string | null }>(
      `SELECT r.*, u.displayName AS candidateName, u.candidateRef AS candidateRef
       FROM suite_results r JOIN users u ON u.id = r.userId WHERE r.suiteId = ?`, suiteId),
  async setBands(suiteId: string, userId: string, bands: Record<string, number>) {
    const existing = await suiteResults.find(suiteId, userId);
    if (existing) {
      await run('UPDATE suite_results SET manualBands = ? WHERE id = ?', JSON.stringify(bands), existing.id);
      return;
    }
    await run('INSERT INTO suite_results (id, suiteId, userId, manualBands) VALUES (?, ?, ?, ?)',
      id(), suiteId, userId, JSON.stringify(bands));
  },
  async release(suiteId: string, userId: string) {
    const existing = await suiteResults.find(suiteId, userId);
    if (existing) await run('UPDATE suite_results SET releasedAt = ? WHERE id = ?', now(), existing.id);
    else await run('INSERT INTO suite_results (id, suiteId, userId, releasedAt) VALUES (?, ?, ?, ?)', id(), suiteId, userId, now());
  },
};

/* ------------------------------------------------------------------ */
/* Imports                                                             */
/* ------------------------------------------------------------------ */

/**
 * Every column of an import except the two big ones.
 *
 * `extractedText` holds up to a megabyte and a half of the uploaded book — it
 * is there so a run cut short can carry on without the original file — and
 * `draft` holds a whole paper. The import screen polls every couple of seconds
 * and needs neither. Reading them anyway meant tens of megabytes out of the
 * database on every poll, which is what made the console crawl while a book
 * was being read.
 */
const IMPORT_META = `id, orgId, filename, mimeType, sizeBytes, status, strategy, provider,
       warnings, error, testId, kind, instructions, testIds, progress, options, userId,
       claimedAt, storageKey, storedIn, expiresAt, purgedAt, createdAt`;

/** An import row without the text of the upload or the draft paper. */
export type ImportMeta = Omit<ImportRow, 'extractedText' | 'draft'>;

export const imports = {
  byId: (importId: string) => one<ImportRow>('SELECT * FROM imports WHERE id = ?', importId),
  /**
   * The row without its two big columns. The live progress stream reads the
   * same row every 600ms; on `SELECT *` that is a megabyte and a half of book
   * text out of the database a hundred times a minute, for a progress bar.
   */
  metaById: (importId: string) =>
    one<ImportMeta>(`SELECT ${IMPORT_META} FROM imports WHERE id = ?`, importId),
  listOrg: (orgId: string, limit = 40) =>
    all<ImportMeta>(
      `SELECT ${IMPORT_META} FROM imports WHERE orgId = ? ORDER BY createdAt DESC LIMIT ?`,
      orgId, limit,
    ),
  count: (orgId?: string) =>
    orgId ? count('SELECT COUNT(*) n FROM imports WHERE orgId = ?', orgId) : count('SELECT COUNT(*) n FROM imports'),
  /**
   * The same file already being read for this organisation. Uploading a book
   * twice because the first one looked stuck is the easiest mistake to make,
   * and it doubles the model bill for a result that is thrown away as duplicate.
   */
  inFlight: (orgId: string, filename: string, sizeBytes: number, exceptId?: string) =>
    one<ImportMeta>(
      `SELECT ${IMPORT_META} FROM imports
       WHERE orgId = ? AND filename = ? AND sizeBytes = ?
         AND status IN ('pending','queued','parsing','parsed')
         ${exceptId ? 'AND id <> ? AND createdAt <= (SELECT createdAt FROM imports WHERE id = ?)' : ''}
       ORDER BY createdAt LIMIT 1`,
      ...(exceptId ? [orgId, filename, sizeBytes, exceptId, exceptId] : [orgId, filename, sizeBytes]),
    ),
  /**
   * Imports whose worker never finished — a redeploy or a crash mid-parse.
   * Anything still queued or parsing after `minutes` is fair game to retry.
   */
  stalled: (minutes = 20, limit = 5) => {
    const stale = new Date(Date.now() - minutes * 60_000).toISOString();
    return all<ImportRow>(
      `SELECT * FROM imports
       WHERE status IN ('queued', 'parsing') AND createdAt <= ?
         AND (claimedAt IS NULL OR claimedAt <= ?)
       ORDER BY createdAt LIMIT ?`,
      stale, stale, limit);
  },
  /**
   * Jobs that stopped part-way through a book. They are not stalled — they gave
   * up their invocation on purpose — so they are picked up at once rather than
   * after the stall timeout.
   */
  partial: (limit = 2, staleMinutes = 20) =>
    all<ImportRow>(
      `SELECT * FROM imports WHERE status = 'queued' AND progress IS NOT NULL
         AND (claimedAt IS NULL OR claimedAt <= ?)
       ORDER BY createdAt LIMIT ?`,
      new Date(Date.now() - staleMinutes * 60_000).toISOString(), limit),
  /**
   * Takes the job, or reports that somebody else already has it.
   *
   * Reading a book is minutes of work, and three things try to start it: the
   * upload itself, every poll of the import console, and the daily sweep. Two
   * workers on one job means every paper saved twice, the answer-key spend paid
   * twice, and one worker's list of papers overwritten by the other's — so the
   * claim happens in a single statement whose condition is re-checked under the
   * row lock, and only the worker the row comes back to may proceed.
   *
   * A claim older than `staleMinutes` is treated as abandoned: the worker that
   * held it was frozen by the platform, and the job would otherwise be stuck.
   */
  async claim(importId: string, staleMinutes = 20): Promise<ImportRow | null> {
    const stale = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    const rows = await all<ImportRow>(
      `UPDATE imports SET status = 'parsing', claimedAt = ?
       WHERE id = ? AND status <> 'committed'
         AND (claimedAt IS NULL OR claimedAt <= ?)
       RETURNING *`,
      now(), importId, stale,
    );
    return rows[0] ?? null;
  },
  /** How many papers one person has asked the model for since a moment. */
  countForUser: (userId: string, since: string) =>
    count('SELECT COUNT(*) n FROM imports WHERE userId = ? AND createdAt >= ?', userId, since),
  /** The jobs one person started, newest first. */
  listForUser: (userId: string, limit = 10) =>
    all<ImportRow>('SELECT * FROM imports WHERE userId = ? ORDER BY createdAt DESC LIMIT ?', userId, limit),
  /** Uploads whose stored copy is due for deletion. */
  expired: (limit = 50) =>
    all<ImportRow>(
      `SELECT * FROM imports
       WHERE storageKey IS NOT NULL AND purgedAt IS NULL AND expiresAt IS NOT NULL AND expiresAt <= ?
       ORDER BY expiresAt LIMIT ?`, now(), limit),
  async create(input: {
    orgId: string; filename: string; mimeType: string; sizeBytes: number; strategy: string;
    kind?: 'upload' | 'generate'; instructions?: string | null;
    options?: Record<string, unknown> | null; userId?: string | null;
  }): Promise<ImportRow> {
    const row: ImportRow = {
      id: id(), orgId: input.orgId, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.sizeBytes, status: 'pending', strategy: input.strategy, provider: null,
      extractedText: null, draft: null, warnings: '[]', error: null, testId: null, createdAt: now(),
      kind: input.kind ?? 'upload', instructions: input.instructions ?? null,
      testIds: '[]', progress: null,
      options: input.options ? JSON.stringify(input.options) : null,
      userId: input.userId ?? null,
      claimedAt: null,
      storageKey: null, storedIn: '[]', expiresAt: null, purgedAt: null,
    };
    await run(`INSERT INTO imports (id, orgId, filename, mimeType, sizeBytes, status, strategy, warnings, kind, instructions, testIds, options, userId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.orgId, row.filename, row.mimeType, row.sizeBytes, row.status,
      row.strategy, row.warnings, row.kind, row.instructions, row.testIds, row.options,
      row.userId, row.createdAt);
    return row;
  },
  async update(importId: string, patch: Partial<Omit<ImportRow, 'id'>>) {
    const { clause, values } = setters(patch);
    if (clause) await run(`UPDATE imports SET ${clause} WHERE id = ?`, ...values, importId);
  },
  remove: (importId: string) => run('DELETE FROM imports WHERE id = ?', importId),
};
