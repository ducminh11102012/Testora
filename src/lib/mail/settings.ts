/**
 * The shape of the mail configuration, and the rule the whole product hangs on:
 * with no mail server configured the platform runs on username and password
 * alone. Kept free of database imports so the console screens can use it.
 */

export interface SmtpConfig {
  /** Off means: no codes, no verification, username and password only. */
  enabled: boolean;
  host: string;
  port: number;
  /** Implicit TLS (port 465). STARTTLS on 587 is negotiated automatically. */
  secure: boolean;
  user: string;
  /** Encrypted at rest; never returned to the browser. */
  passEnc: string;
  fromEmail: string;
  fromName: string;
  /**
   * With mail working, require a verified address before an account can be
   * used. Turning this on is what sends existing username-only accounts to the
   * "add your email" screen on their next visit.
   */
  requireVerification: boolean;
}

export const SMTP_FALLBACK: SmtpConfig = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  passEnc: '',
  fromEmail: '',
  fromName: '',
  requireVerification: true,
};

export function smtpUsable(c: SmtpConfig): boolean {
  return !!(c.enabled && c.host && c.port && c.fromEmail);
}

/** A six-digit code: long enough to be safe with the attempt limit, short enough to retype. */
export function newCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
}
