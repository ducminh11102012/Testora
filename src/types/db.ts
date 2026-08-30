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
}

export interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  /** `platform` is the public B2C tenant; `tenant` rows are B2B customers. */
  kind: 'platform' | 'tenant';
  plan: string;
  branding: string;  // Branding JSON
  settings: string;  // OrgSettings JSON
  createdAt: string;
}

export interface UserRow {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  displayName: string;
  /** Printed in the exam header in place of a name. */
  candidateRef: string | null;
  /** Platform staff: can see every organisation. */
  isPlatformAdmin: number;
  credits: number;
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
  /** `private` = this org only; `catalog` = listed in the public B2C catalogue. */
  visibility: 'private' | 'catalog';
  priceCredits: number;
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
}

export interface ExamSessionRow {
  id: string;
  orgId: string;
  testId: string;
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
  markerId: string;
  rubricId: string | null;
  scores: string;  // { [criterionKey]: number }
  comment: string;
  awarded: number;
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
  status: 'pending' | 'parsed' | 'committed' | 'failed';
  strategy: string;
  provider: string | null;
  extractedText: string | null;
  draft: string | null;
  warnings: string;
  error: string | null;
  testId: string | null;
  createdAt: string;
}
