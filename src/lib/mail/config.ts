import { editVault, readVault } from '../storage/vault';
import { decryptSecret, encryptSecret, maskSecret } from '../ai/secret';
import { SMTP_FALLBACK, SmtpConfig, smtpUsable } from './settings';

export * from './settings';

/**
 * Console settings win; environment variables remain a valid way to deploy.
 * Like the AI key, the mail password lives in the encrypted settings object in
 * the private bucket rather than in the database.
 */
export async function loadSmtp(): Promise<SmtpConfig> {
  const stored = await readVault().then((v) => v.smtp as Partial<SmtpConfig>).catch(() => ({} as Partial<SmtpConfig>));
  const merged: SmtpConfig = { ...SMTP_FALLBACK, ...stored };

  if (!merged.host && process.env.SMTP_HOST) {
    return {
      ...merged,
      enabled: process.env.SMTP_ENABLED !== 'false',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? '',
      passEnc: process.env.SMTP_PASSWORD ? encryptSecret(process.env.SMTP_PASSWORD) : '',
      fromEmail: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? '',
      fromName: process.env.SMTP_FROM_NAME ?? '',
    };
  }
  return merged;
}

export async function saveSmtp(patch: Partial<SmtpConfig> & { password?: string }): Promise<SmtpConfig> {
  await editVault((v) => {
    const next: Partial<SmtpConfig> = { ...(v.smtp as Partial<SmtpConfig>), ...patch };
    delete (next as { password?: string }).password;
    if (patch.password !== undefined) next.passEnc = patch.password ? encryptSecret(patch.password) : '';
    v.smtp = next as Record<string, unknown>;
  });
  return loadSmtp();
}

export function smtpPassword(c: SmtpConfig): string {
  return decryptSecret(c.passEnc);
}

/** What the browser is allowed to see. */
export function publicSmtp(c: SmtpConfig) {
  const { passEnc, ...rest } = c;
  return { ...rest, passwordMasked: maskSecret(decryptSecret(passEnc)), usable: smtpUsable(c) };
}

/**
 * The one question the rest of the app asks: is email part of signing up?
 * False means username and password are enough, everywhere.
 */
export async function verificationRequired(): Promise<boolean> {
  const c = await loadSmtp();
  return smtpUsable(c) && c.requireVerification;
}
