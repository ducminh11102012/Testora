/**
 * A small in-memory rate limit.
 *
 * This is for the handful of endpoints where guessing is the attack: signing
 * in, redeeming a code, typing a sitting code, asking for a verification
 * email. It is deliberately modest about what it is — one process's memory, so
 * a deployment running several instances limits per instance, and a restart
 * forgets everything. That is still the difference between a password being
 * guessable in an afternoon and not, and it needs no other moving parts.
 *
 * Anything stronger belongs in front of the application, where the request
 * arrives: a WAF, or the host's own rate limiting.
 */

interface Window { hits: number; until: number }

const windows = new Map<string, Window>();
let lastSweep = Date.now();

/** Forgets expired windows, so a busy day cannot grow the map without end. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, window] of windows) if (window.until <= now) windows.delete(key);
}

export interface Limit {
  /** How many attempts are allowed in the window. */
  limit: number;
  /** The window, in seconds. */
  windowSec: number;
}

export interface Verdict {
  ok: boolean;
  /** Attempts left after this one. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

export function take(key: string, { limit, windowSec }: Limit): Verdict {
  const now = Date.now();
  sweep(now);
  const found = windows.get(key);
  if (!found || found.until <= now) {
    windows.set(key, { hits: 1, until: now + windowSec * 1000 });
    return { ok: true, remaining: limit - 1, retryAfter: windowSec };
  }
  found.hits += 1;
  const retryAfter = Math.max(1, Math.ceil((found.until - now) / 1000));
  return { ok: found.hits <= limit, remaining: Math.max(0, limit - found.hits), retryAfter };
}

/** Clears one key — used after a successful sign-in, so a typo costs nothing. */
export function forget(key: string): void {
  windows.delete(key);
}

/**
 * Who is asking, as well as this can be known behind a proxy. The first hop of
 * `x-forwarded-for` is what the platform sets; everything else is a guess, and
 * an unknown caller shares one bucket rather than escaping the limit.
 */
export function callerKey(headers: Headers, scope: string): string {
  const forwarded = headers.get('x-forwarded-for') ?? '';
  const ip = forwarded.split(',')[0].trim()
    || headers.get('x-real-ip')
    || headers.get('cf-connecting-ip')
    || 'unknown';
  return `${scope}:${ip}`;
}
