import nodemailer from 'nodemailer';
import { SmtpConfig, smtpPassword, smtpUsable } from './config';

/** One transport per configuration, rebuilt when the settings change. */
let cached: { key: string; tx: nodemailer.Transporter } | null = null;

function transport(c: SmtpConfig): nodemailer.Transporter {
  const key = JSON.stringify([c.host, c.port, c.secure, c.user, c.passEnc]);
  if (cached?.key !== key) {
    cached = {
      key,
      tx: nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: c.user ? { user: c.user, pass: smtpPassword(c) } : undefined,
      }),
    };
  }
  return cached.tx;
}

export async function sendMail(c: SmtpConfig, msg: { to: string; subject: string; text: string; html?: string }) {
  if (!smtpUsable(c)) throw new Error('No mail server is configured.');
  const from = c.fromName ? `"${c.fromName}" <${c.fromEmail}>` : c.fromEmail;
  await transport(c).sendMail({ from, ...msg });
}

export async function verifySmtp(c: SmtpConfig) {
  if (!smtpUsable(c)) throw new Error('Fill in the host, the port and the from address first.');
  await transport(c).verify();
}

/** The one message the platform sends by itself. */
export function verificationMessage(input: { code: string; wordmark: string; minutes: number }) {
  const { code, wordmark, minutes } = input;
  return {
    subject: `${code} is your ${wordmark} verification code`,
    text: `Your ${wordmark} verification code is ${code}.\n\n`
      + `It expires in ${minutes} minutes. If you did not ask for it, ignore this message.`,
    html: `<p style="font:16px/1.5 system-ui,sans-serif">Your ${wordmark} verification code is</p>`
      + `<p style="font:600 34px/1.2 system-ui,sans-serif;letter-spacing:.18em">${code}</p>`
      + `<p style="font:15px/1.5 system-ui,sans-serif;color:#5e5e5e">It expires in ${minutes} minutes. `
      + 'If you did not ask for it, ignore this message.</p>',
  };
}
