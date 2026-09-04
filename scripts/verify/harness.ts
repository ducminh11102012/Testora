/**
 * A tiny test harness.
 *
 * There is no test runner in this project's dependencies on purpose: the
 * checks have to run on a plain `npm install` on a school's own server, and a
 * runner would be one more thing to keep working. What a runner actually buys
 * is a way to say "this held" and "this did not", and to count both — which is
 * all of this file.
 */

export interface Failure { suite: string; check: string; detail: string }

const failures: Failure[] = [];
let checks = 0;
let current = 'general';

export function suite(name: string): void {
  current = name;
  process.stdout.write(`\n${name}\n`);
}

/** Records a check. Never throws: one bad assertion must not hide the rest. */
export function check(name: string, ok: boolean, detail = ''): boolean {
  checks += 1;
  if (ok) {
    process.stdout.write(`  ✓ ${name}\n`);
    return true;
  }
  failures.push({ suite: current, check: name, detail });
  process.stdout.write(`  ✗ ${name}${detail ? ` — ${detail}` : ''}\n`);
  return false;
}

export function equal(name: string, actual: unknown, expected: unknown): boolean {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  return check(name, same, same ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function near(name: string, actual: number, expected: number, tolerance = 0.001): boolean {
  const ok = Math.abs(actual - expected) <= tolerance;
  return check(name, ok, ok ? '' : `expected ${expected} ± ${tolerance}, got ${actual}`);
}

/** True when a block of code throws — for the checks that assert a refusal. */
export async function throws(name: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return check(name, false, 'nothing was thrown');
  } catch {
    return check(name, true);
  }
}

export function report(): never {
  process.stdout.write(`\n${checks} checks, ${failures.length} failed\n`);
  if (failures.length) {
    for (const f of failures) process.stdout.write(`  ✗ ${f.suite} › ${f.check}${f.detail ? ` — ${f.detail}` : ''}\n`);
    process.exit(1);
  }
  process.stdout.write('everything held\n');
  process.exit(0);
}
