import { NextRequest, NextResponse } from 'next/server';
import { attempts, memberships, sittings, suites } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One CSV field: quoted when it has to be, and never able to start a formula. */
function field(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  /*
   * A cell beginning =, +, - or @ is executed by Excel when the file is
   * opened, and these cells hold names typed by other people. Prefixing an
   * apostrophe is the fix every spreadsheet understands.
   */
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: unknown[][]): string {
  // A byte-order mark, because Excel reads a plain UTF-8 CSV as Latin-1 and
  // turns every Vietnamese name into mojibake.
  return `﻿${rows.map((row) => row.map(field).join(',')).join('\r\n')}\r\n`;
}

/**
 * Results as a spreadsheet.
 *
 * Every school asks for this within a week of their first sitting: the marks
 * have to go into a report card, a parents' evening, or the school's own
 * system, and none of those read a web page. Three scopes — everything the
 * organisation has sat, one sitting, or one full test.
 */
export async function GET(req: NextRequest) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  const params = new URL(req.url).searchParams;
  const sittingId = params.get('sitting');
  const suiteId = params.get('suite');

  const cohortOf = new Map((await memberships.listOrg(ctx.org.id)).map((m) => [m.id, m.cohort ?? '']));

  let rows = await attempts.finished(ctx.org.id);
  let name = 'results';

  if (sittingId) {
    const sitting = await sittings.byId(sittingId);
    if (!sitting || !await sameOrg(ctx, sitting.orgId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    rows = rows.filter((row) => row.sessionId === sitting.id);
    name = sitting.name;
  } else if (suiteId) {
    const suite = await suites.byId(suiteId);
    if (!suite || !await sameOrg(ctx, suite.orgId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    rows = rows.filter((row) => row.suiteId === suite.id);
    name = suite.title;
  }

  const table: unknown[][] = [[
    'Candidate', 'Candidate number', 'Email', 'Class', 'Paper', 'Module', 'Sitting',
    'Mode', 'Started', 'Submitted', 'Marks', 'Out of', 'Band', 'Status',
  ]];

  for (const row of rows) {
    table.push([
      row.candidateName,
      row.candidateRef ?? '',
      row.candidateEmail ?? '',
      cohortOf.get(row.userId) ?? '',
      row.testTitle,
      row.testModule,
      row.sessionName ?? '',
      row.mode === 'practice' ? 'practice' : 'exam',
      row.startedAt,
      row.submittedAt ?? '',
      Math.round(((row.rawScore ?? 0) + (row.manualScore ?? 0)) * 100) / 100,
      row.testQuestionCount ?? '',
      row.band ?? '',
      row.status,
    ]);
  }

  const filename = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv(table), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
