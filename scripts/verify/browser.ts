/**
 * The checks that need the whole thing running: a browser, a server, a
 * database, and a signed-in person of each kind.
 *
 * These are the ones that catch what unit checks cannot — that a page renders
 * at all, that a guard refuses the right people, that a candidate's copy of a
 * paper does not carry the answer key, that a recording keeps playing across
 * parts. They need a server, so they are a separate command: `npm run
 * verify:browser`, with BASE_URL and the four sign-ins below.
 *
 * Playwright is not a dependency of this project — it is far too large to ask a
 * school to install — so this file loads it from wherever it happens to be and
 * says plainly when it is not there.
 */

import { check, report, suite } from './harness';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

interface Who { email: string; password: string }
const WHO: Record<string, Who> = {
  admin: { email: process.env.VERIFY_ADMIN ?? 'admin@testora.test', password: process.env.VERIFY_ADMIN_PW ?? 'admin1234' },
  owner: { email: process.env.VERIFY_OWNER ?? 'owner@chuyen.test', password: process.env.VERIFY_OWNER_PW ?? 'owner1234' },
  teacher: { email: process.env.VERIFY_TEACHER ?? 'teacher@chuyen.test', password: process.env.VERIFY_TEACHER_PW ?? 'teach1234' },
  candidate: { email: process.env.VERIFY_CANDIDATE ?? 'candidate@chuyen.test', password: process.env.VERIFY_CANDIDATE_PW ?? 'test1234' },
};

/** Pages that must render without a client-side error, per role. */
const PAGES: Record<string, string[]> = {
  admin: [
    '/platform', '/platform/applications', '/platform/ai', '/platform/usage', '/platform/email',
    '/platform/sign-in', '/platform/storage', '/admin', '/admin/tests', '/admin/suites',
    '/admin/sessions', '/admin/import', '/admin/library', '/admin/marking', '/admin/attempts',
    '/admin/reports', '/admin/people', '/admin/branding', '/admin/codes', '/admin/ai-usage',
    '/admin/storage',
  ],
  owner: [
    '/admin', '/admin/tests', '/admin/suites', '/admin/sessions', '/admin/import', '/admin/library',
    '/admin/marking', '/admin/attempts', '/admin/reports', '/admin/people', '/admin/branding',
    '/admin/codes', '/admin/ai-usage',
  ],
  teacher: ['/admin', '/admin/tests', '/admin/import', '/admin/library', '/admin/sessions', '/admin/marking', '/admin/reports'],
  candidate: ['/dashboard', '/catalogue', '/billing'],
};

/*
 * Playwright's own types are not installed either, so the slice of it used here
 * is described locally. That keeps this file compiling in a checkout that has
 * never seen a browser driver.
 */
interface Page {
  setDefaultTimeout(ms: number): void;
  on(event: 'pageerror', handler: (error: unknown) => void): void;
  goto(url: string, opts?: { waitUntil?: string }): Promise<{ status(): number } | null>;
  url(): string;
  content(): Promise<string>;
  waitForTimeout(ms: number): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  locator(selector: string): {
    first(): { fill(v: string): Promise<void>; getAttribute(name: string): Promise<string | null> };
    count(): Promise<number>;
    innerText(): Promise<string>;
  };
  evaluate<T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T>;
  context(): { close(): Promise<void> };
}
interface Chromium {
  launch(opts: { executablePath?: string; args?: string[] }): Promise<{
    newContext(opts?: { viewport?: { width: number; height: number } }): Promise<{ newPage(): Promise<Page> }>;
    close(): Promise<void>;
  }>;
}

async function loadPlaywright(): Promise<{ chromium: Chromium } | null> {
  for (const spec of [
    'playwright',
    '/opt/node-tools/node_modules/playwright/index.js',
    'playwright-core',
  ]) {
    try {
      // CommonJS builds arrive under `default`, ES builds at the top level.
      const mod = await import(spec) as { chromium?: Chromium; default?: { chromium?: Chromium } };
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return { chromium };
    } catch { /* try the next place */ }
  }
  return null;
}

async function main(): Promise<void> {
  const pw = await loadPlaywright();
  if (!pw) {
    process.stdout.write(
      'Playwright is not installed, so the browser checks were skipped.\n'
      + 'Install it where you run these (npm i -D playwright && npx playwright install chromium)\n'
      + 'or run `npm run verify` for the checks that need nothing.\n',
    );
    process.exit(0);
  }

  const browser = await pw.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-proxy-server'],
  });

  const open = async (who: Who) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
    page.setDefaultTimeout(45_000);
    const errors: string[] = [];
    page.on('pageerror', (e: unknown) => errors.push(String(e).slice(0, 160)));
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('input').first().fill(who.email);
    await page.fill('input[type=password]', who.password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(4000);
    return { page, errors };
  };

  /* --------------------------- every page renders ------------------------ */

  suite('Every console page renders');
  for (const [role, paths] of Object.entries(PAGES)) {
    const { page, errors } = await open(WHO[role]);
    const signedIn = !page.url().includes('/login');
    check(`${role} can sign in`, signedIn, page.url());
    if (signedIn) {
      for (const path of paths) {
        errors.length = 0;
        const response = await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => null);
        await page.waitForTimeout(350);
        const status = response?.status() ?? 0;
        const body = await page.locator('body').innerText().catch(() => '');
        check(
          `${role} ${path}`,
          status < 500 && errors.length === 0 && !/Application error|Unhandled Runtime Error/.test(body),
          [status ? `HTTP ${status}` : 'no response', ...errors].join(' · '),
        );
      }
    }
    await page.context().close();
  }

  /* ------------------------- the guards actually guard ------------------- */

  suite('The guards refuse the right people');

  const candidate = await open(WHO.candidate);
  const api = (path: string, method = 'GET', body?: unknown) => candidate.page.evaluate<
    { status: number; body: Record<string, unknown> },
    [string, string, unknown]
  >(
    async ([target, verb, payload]) => {
      const res = await fetch(target, {
        method: verb,
        ...(payload ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {}),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    [path, method, body ?? null],
  );

  for (const path of ['/api/admin/tests', '/api/admin/suites', '/api/admin/import', '/api/admin/library', '/api/platform/ai']) {
    const res = await api(path);
    check(`a candidate is refused ${path}`, res.status === 401 || res.status === 403, `HTTP ${res.status}`);
  }
  const setup = await api('/api/setup', 'POST', {
    displayName: 'Intruder', username: 'intruder', password: 'password-1234',
  });
  check('the setup route is closed once claimed', setup.status === 409, `HTTP ${setup.status}`);

  /* ------------------------- the platform's own health ------------------- */

  suite('Health and rate limits');

  const health = await candidate.page.evaluate<{ status: number; body: Record<string, unknown> }, string>(
    async (base) => {
      const res = await fetch(`${base}/api/health`);
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    BASE,
  );
  check('the health check answers', health.status === 200 && health.body.ok === true, JSON.stringify(health.body));

  const guesses = await candidate.page.evaluate<number[], string>(async (base) => {
    const codes: number[] = [];
    for (let i = 0; i < 14; i += 1) {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: `nobody-${Math.random().toString(36).slice(2)}`, password: 'wrong' }),
      });
      codes.push(res.status);
    }
    return codes;
  }, BASE);
  check('guessing a password is throttled', guesses.includes(429), guesses.join(','));

  /* ---------------- the candidate's copy carries no answers -------------- */

  suite("A candidate's paper carries no answers");

  await candidate.page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  const suiteLink = await candidate.page.locator('a[href^="/suite/"]').first().getAttribute('href').catch(() => null);
  const paperButton = await candidate.page.locator('button:has-text("Start")').count();

  let attemptId: string | null = null;
  if (suiteLink) {
    const started = await candidate.page.evaluate<{ attemptId?: string }, string>(async (href) => {
      const suiteId = href.split('/').pop();
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ suiteId, skill: 'reading', mode: 'practice', minutes: 10 }),
      });
      return res.json();
    }, suiteLink);
    attemptId = started.attemptId ?? null;
  }

  if (!attemptId) {
    check('a paper could be started for the leak check', false, `no full test on the dashboard (${paperButton} paper buttons)`);
  } else {
    await candidate.page.goto(`${BASE}/test/${attemptId}`, { waitUntil: 'networkidle' });
    await candidate.page.waitForTimeout(2500);
    const html = await candidate.page.content();
    const nonEmpty = [
      ...(html.match(/"answers":\[[^\]]/g) ?? []),
      ...(html.match(/\\"answers\\":\[[^\]]/g) ?? []),
    ];
    check('no answer key in the page the candidate is served', nonEmpty.length === 0, `${nonEmpty.length} answer arrays`);
    check('no marking rubric in it either', !/Nội dung|marking scheme/i.test(html));
  }

  /* ------------- a practice run hands the candidate a result ------------- */

  suite('Practice ends in a result, not in silence');

  if (attemptId) {
    const outcome = await candidate.page.evaluate<{ practice?: boolean; suiteId?: string | null; ok?: boolean }, string>(
      async (id) => {
        const res = await fetch(`/api/attempts/${id}/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: {} }),
        });
        return res.json();
      }, attemptId,
    );
    check('the practice run is handed in', outcome.ok === true);
    check('and is marked as practice', outcome.practice === true);
    check('and is not sent back to the hub, where it would vanish',
      outcome.suiteId === null, `suiteId ${String(outcome.suiteId)}`);

    await candidate.page.goto(`${BASE}/results/${attemptId}`, { waitUntil: 'networkidle' });
    const result = await candidate.page.content();
    check('the result page opens on it', /Practice run/.test(result));
    check('and shows a mark rather than withholding it',
      !/is not being released|withheld/i.test(result));
  } else {
    check('a practice run could be started', false, 'no full test to practise on');
  }

  await browser.close();
  report();
}

void main();
