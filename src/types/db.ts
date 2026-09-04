export type OrgRole = 'owner' | 'admin' | 'teacher' | 'candidate';
export type TestStatus = 'draft' | 'published' | 'archived';
export type AttemptStatus = 'in_progress' | 'submitted' | 'marking' | 'marked';

export interface Branding {
  /** Wordmark shown when no logo image is set. */
  wordmark: string;
  /** Small line under the wordmark on landing pages. */
  tagline?: string;
  /** Data URL or path. Overrides the wordmark in the exam header. */
  logoUrl?: string;
  primary: string;
  primaryDark: string;
  accent: string;
  /** Surface tint used for the part banner. */
  banner: string;
  /** Progress rail fill. */
  rail: string;
  railTrack: string;
}

export interface OrgSettings {
  /** Default anti-cheat posture for new sittings. */
  blockCopyPaste: boolean;
  trackFocusLoss: boolean;
  lockPartOnLeave: boolean;
  shuffleQuestions: boolean;
  /** B2C only: how many credits a new account starts with. */
  signupCredits: number;
  allowSelfSignup: boolean;
  /** What a candidate may see once they have submitted. */
  showScore: boolean;
  showAnswers: boolean;
  /**
   * A candidate with nothing to sit may have a full test drawn for them out of
   * the bank. Costs nothing, so it is on by default.
   */
  allowCandidateAssembly: boolean;
  /**
   * A candidate may ask the model to write them a paper. This spends the
   * platform's AI budget, so it is off until a centre turns it on, and capped
   * per candidate per day when it is.
   */
  allowCandidateCompose: boolean;
  candidateComposePerDay: number;
}

export type OrgKind = 'platform' | 'community' | 'tenant';

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  /**
   * `platform` is the public B2C tenant that owns the free shared bank,
   * `community` is the open space the platform admin's code joins you to,
   * and `tenant` rows are B2B customers.
   */
  kind: OrgKind;
  plan: string;
  /** Typed at sign-up (or on the join page) to become a candidate here. */
  joinCode: string | null;
  branding: string;  // Branding JSON
  settings: string;  // OrgSettings JSON
  createdAt: string;
}

export interface UserRow {
  id: string;
  /** Null while the platform runs without a mail server. */
  email: string | null;
  username: string;
  passwordHash: string;
  displayName: string;
  /** Printed in the exam header in place of a name. */
  candidateRef: string | null;
  /** Platform staff: can see every organisation. */
  isPlatformAdmin: number;
  credits: number;
  /** Set once the account has confirmed a code sent to its address. */
  emailVerifiedAt: string | null;
  /** The Hugging Face account this one signs in with, when it does. */
  hfId: string | null;
  hfName: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface MembershipRow {
  id: string;
  userId: string;
  orgId: string;
  role: OrgRole;
  /** Free-text cohort/class label used for reporting. */
  cohort: string | null;
  createdAt: string;
}

export interface TestRow {
  id: string;
  orgId: string;
  title: string;
  module: 'reading' | 'listening' | 'writing' | 'mixed';
  variant: string;
  status: TestStatus;
  durationMin: number;
  content: string;
  /**
   * `private` this organisation's candidates see it in their list
   * `catalog` listed in the public catalogue, possibly for credits
   * `sitting` hidden from every list: it opens only with a sitting code
   * `suite`   hidden from every list: it opens inside a full test
   */
  visibility: 'private' | 'catalog' | 'sitting' | 'suite';
  priceCredits: number;
  /** 1 when the paper may be drawn on to assemble a full test at random. */
  bank: number;
  /** The book or exam it was taken from, when it came from one. */
  source: string | null;
  /** The folder it is filed under. Null means the organisation's top level. */
  folder: string | null;
  /** 1 when every organisation may copy it: the shared Testora library. */
  shared: number;
  /**
   * How many questions the paper holds, counted when it was written. Null on a
   * paper saved before the column existed, until the next save or the backfill.
   */
  questionCount: number | null;
  /** 1 when the paper has a recording — its own, or on one of its parts. */
  hasAudio: number;
  /** The paper's own description, copied out for list cards. */
  summary: string | null;
  /** A hash of the questions, so the same paper is not imported twice. */
  fingerprint: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSettings {
  blockCopyPaste: boolean;
  trackFocusLoss: boolean;
  lockPartOnLeave: boolean;
  shuffleQuestions: boolean;
  /** Show the score to the candidate the moment they submit. */
  releaseResultsImmediately: boolean;
  /** Show which answers were right once the score is out. */
  showAnswers: boolean;
  /** Ask the browser for full screen, and log every exit from it. */
  requireFullscreen: boolean;
  /** Take the right-click menu away, which is where copying usually starts. */
  blockRightClick: boolean;
  /**
   * Hand the paper in automatically after this many departures from the exam
   * window. 0 leaves it to the invigilator.
   */
  maxFocusLoss: number;
  /** One attempt per candidate, however many codes they have. */
  singleAttempt: boolean;
}

export interface ExamSessionRow {
  id: string;
  orgId: string;
  /** One of these is set: a single paper, or a full test sat skill by skill. */
  testId: string | null;
  suiteId?: string | null;
  name: string;
  accessCode: string;
  opensAt: string | null;
  closesAt: string | null;
  /** Overrides the paper's own duration when > 0. */
  durationMin: number;
  status: 'scheduled' | 'open' | 'closed';
  settings: string; // SessionSettings JSON
  createdAt: string;
}

export interface AttemptRow {
  id: string;
  orgId: string;
  testId: string;
  sessionId: string | null;
  userId: string;
  status: AttemptStatus;
  startedAt: string;
  endsAt: string;
  submittedAt: string | null;
  answers: string;
  annotations: string;
  flags: string;
  /** Auto-marked objective score. */
  rawScore: number | null;
  /** Points awarded by a human marker for essay tasks. */
  manualScore: number | null;
  band: number | null;
  report: string | null;
  /** Set when this attempt is one skill of a multi-skill sitting. */
  suiteId: string | null;
  skill: string | null;
  /**
   * 1 when the paper is sat with no time limit. `endsAt` is then a nominal date
   * a year out, only there because the column cannot be null — the exam screen
   * reads this flag rather than trying to infer it from the dates.
   */
  untimed?: number;
  /**
   * 'exam' is the real thing and counts towards the full test's report;
   * 'practice' is the candidate rehearsing one section on their own terms.
   */
  mode?: 'exam' | 'practice';
  createdAt: string;
}

export interface RubricCriterion {
  key: string;
  label: string;
  max: number;
  descriptors?: string;
}

export interface RubricRow {
  id: string;
  orgId: string;
  name: string;
  criteria: string; // RubricCriterion[] JSON
  createdAt: string;
}

export interface MarkingRow {
  id: string;
  attemptId: string;
  questionId: string;
  /** Null when the mark came from the model rather than a person. */
  markerId: string | null;
  rubricId: string | null;
  scores: string;  // { [criterionKey]: number }
  comment: string;
  awarded: number;
  source: 'human' | 'ai';
  /** { strengths: string[], improvements: string[] } */
  feedback: string;
  createdAt: string;
}

export interface AccessCodeRow {
  id: string;
  code: string;
  orgId: string | null;
  testId: string | null;
  credits: number;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  note: string;
  createdAt: string;
}

export interface OrderRow {
  id: string;
  userId: string;
  orgId: string | null;
  description: string;
  amountMinor: number;
  currency: string;
  credits: number;
  provider: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  reference: string | null;
  createdAt: string;
}

export interface AttemptEventRow {
  id: string;
  attemptId: string;
  type: string;
  at: string;
  meta: string;
}

export interface ImportRow {
  id: string;
  orgId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'queued' | 'parsing' | 'parsed' | 'committed' | 'failed';
  strategy: string;
  provider: string | null;
  extractedText: string | null;
  draft: string | null;
  warnings: string;
  error: string | null;
  testId: string | null;
  /** 'upload' is a file; 'generate' is a paper the model wrote to order. */
  kind: 'upload' | 'generate';
  /** What the operator asked for, when the model wrote the paper. */
  instructions: string | null;
  /** Every paper the job produced, as JSON. A book makes many. */
  testIds: string;
  /** Where the job has got to, as JSON: { done, total, label }. */
  progress: string | null;
  /** The options the job was started with, as JSON. */
  options: string | null;
  /** Who started it, when that matters — a candidate's daily allowance. */
  userId: string | null;
  /** When a worker took the job, so a second one leaves it alone. */
  claimedAt: string | null;
  /** Where the original upload lives until it is deleted. */
  storageKey: string | null;
  /** Bucket ids the file was written to, as JSON. */
  storedIn: string;
  /** When the stored copy is due to be deleted; null once it is gone. */
  expiresAt: string | null;
  purgedAt: string | null;
  createdAt: string;
}
