import { memberships, users } from '../db';
import { createSession, sessionFor, setSessionCookie } from '../auth';
import { HfProfile } from './oauth';
import { HfAuthConfig } from './config';

/**
 * Turns a Hugging Face identity into a session here.
 *
 * This route is deliberately for staff only. A Hub account is a developer's
 * account; a candidate has no business needing one to sit an exam, and signs in
 * with the username their centre issued. So the button links to an account that
 * already exists and already holds a staff role — it never creates an account
 * and never lets a candidate in.
 *
 * Matching runs on the Hub id first, then on a verified email address, so a
 * member of staff who signed up with a password and later uses the button lands
 * in the same account rather than a second one.
 */
export async function signInWithHf(profile: HfProfile, _config: HfAuthConfig): Promise<
  { ok: true; role: string; created: boolean } | { ok: false; error: string }
> {
  if (!profile.sub) return { ok: false, error: 'The Hub did not identify the account.' };

  let account = await users.byHfId(profile.sub);

  // First time through: attach the Hub profile to the staff account that owns
  // the same verified address.
  if (!account && profile.email && profile.emailVerified) {
    const byEmail = await users.byEmail(profile.email);
    if (byEmail) {
      account = await users.update(byEmail.id, {
        hfId: profile.sub,
        hfName: profile.username,
        avatarUrl: profile.picture,
        emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date().toISOString(),
      });
    }
  }

  if (!account) {
    return {
      ok: false,
      error: 'No account here is linked to that Hugging Face profile. Sign in with your username '
        + 'first; the link is made the moment the addresses match.',
    };
  }

  const roles = await memberships.of(account.id);
  const staff = account.isPlatformAdmin === 1
    || roles.some((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'teacher');
  if (!staff) {
    return {
      ok: false,
      error: 'Hugging Face sign-in is for staff. Candidates sign in with the username their centre '
        + 'issued.',
    };
  }

  await users.update(account.id, {
    hfId: profile.sub, hfName: profile.username, avatarUrl: profile.picture,
  });

  const session = await sessionFor(account.id);
  if (!session) return { ok: false, error: 'Could not start a session.' };
  setSessionCookie(await createSession(session));
  return { ok: true, role: session.role, created: false };
}
