import { Branding, OrgSettings } from '@/types/db';

/**
 * Values shared by the server and the browser. Kept apart from the data layer
 * so importing them never drags the SQLite driver into a client bundle.
 */

export const DEFAULT_BRANDING: Branding = {
  wordmark: 'Testora',
  tagline: 'Assessment delivery',
  primary: '#1F4FD8',
  primaryDark: '#173CA6',
  accent: '#0F9D77',
  banner: '#F1F3F7',
  rail: '#D7E1FB',
  railTrack: '#F5F8FE',
};

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  blockCopyPaste: true,
  trackFocusLoss: true,
  lockPartOnLeave: false,
  shuffleQuestions: false,
  signupCredits: 1,
  allowSelfSignup: true,
  showScore: true,
  showAnswers: true,
  allowCandidateAssembly: true,
  allowCandidateCompose: false,
  candidateComposePerDay: 2,
};

export const DEFAULT_SESSION_SETTINGS = {
  blockCopyPaste: true,
  trackFocusLoss: true,
  lockPartOnLeave: false,
  shuffleQuestions: false,
  releaseResultsImmediately: true,
  showAnswers: true,
  requireFullscreen: false,
  blockRightClick: true,
  maxFocusLoss: 0,
  singleAttempt: false,
};
