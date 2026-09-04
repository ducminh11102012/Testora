import { NextRequest, NextResponse } from 'next/server';
import { imports } from '@/lib/db';
import { extractFile } from '@/lib/parse/extract';
import { isResponse, staffContext } from '@/lib/api-guard';
import { Strategy } from '@/lib/parse';
import { Grain } from '@/lib/parse/book';
import { putObject } from '@/lib/storage/client';
import { loadStorageSettings } from '@/lib/storage/buckets';
import { targetsFor } from '@/lib/storage/vault';
import { expiryFor, sweepExpired } from '@/lib/storage/retention';
import { importStage, resumeStalled, startImport } from '@/lib/import-runner';

export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Takes the upload, stores it, and hands it to the background runner. The reply
 * comes back at once: parsing a long paper and writing its answer key takes
 * minutes, and staff should be able to close the tab and come back to a
 * finished paper in their bank.
 */
export async function POST(req: NextRequest) {
  // Importing a paper is teaching work, so teachers may do it as well as
  // owners and admins. Organisation settings — people, branding, storage,
  // codes — stay with owners and admins.
  const ctx = await staffContext('staff');
  if (isResponse(ctx)) return ctx;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is larger than 40 MB.' }, { status: 413 });

  /*
   * Some papers come as two files: the paper for the candidates and the answer
   * key for the teacher. The key is read here rather than stored, because what
   * the parser wants is its text — and its text is small even when the paper is
   * a whole book. A key printed inside the paper needs none of this.
   */
  const keyFile = form.get('keyFile');
  let keyText = '';
  const keyWarnings: string[] = [];
  if (keyFile instanceof File && keyFile.size > 0) {
    if (keyFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That answer-key file is larger than 40 MB.' }, { status: 413 });
    }
    try {
      const extracted = await extractFile(
        keyFile.name,
        keyFile.type || 'application/octet-stream',
        Buffer.from(await keyFile.arrayBuffer()),
      );
      keyText = extracted.text.slice(0, 200_000);
      keyWarnings.push(...extracted.warnings);
      if (!keyText.trim()) {
        keyWarnings.push(
          `Nothing could be read out of ${keyFile.name} — if it is a scan, the answers cannot be `
          + 'taken from it. Type them into the paper instead, or upload a key with a text layer.',
        );
      }
    } catch (err) {
      keyWarnings.push(`The answer-key file could not be read: ${(err as Error).message}`);
    }
  }

  /*
   * Already being read. The reply says so rather than starting a second run:
   * two workers on one book is two model bills and one set of papers, and the
   * second set is thrown away as duplicates at the end.
   */
  const already = await imports.inFlight(ctx.org.id, file.name, file.size);
  if (already && String(form.get('again') ?? '0') !== '1') {
    const stage = importStage(already);
    return NextResponse.json({
      error: `“${file.name}” is already being read — ${stage.label.toLowerCase()}. `
        + 'Wait for it to finish, or remove that import first if it is stuck.',
      importId: already.id,
      inFlight: true,
    }, { status: 409 });
  }

  const strategy = String(form.get('strategy') ?? 'hybrid') as Strategy;
  const module = (form.get('module') ? String(form.get('module')) : undefined) as
    'reading' | 'listening' | 'writing' | 'mixed' | undefined;
  const title = form.get('title') ? String(form.get('title')) : undefined;
  const writeMissingAnswers = String(form.get('writeAnswers') ?? '1') !== '0';
  const publish = String(form.get('publish') ?? '0') === '1';
  // A book always goes to the bank; a single paper does when the operator says.
  const bank = form.get('bank') === null ? undefined : String(form.get('bank')) === '1';
  // Explanations cost another model call per ten questions, so they are asked
  // for rather than assumed.
  const explain = String(form.get('explain') ?? '0') === '1';
  // Where the papers are filed. A book falls back to its own title.
  const folder = form.get('folder') ? String(form.get('folder')).trim().slice(0, 80) : undefined;
  /*
   * "This is a whole book — split it." Without it the splitter is cautious, and
   * has to be: cutting a single paper into pieces is worse than leaving it
   * whole. With it, one paper is a failure and every rule is tried, ending in
   * cutting by length.
   */
  const book = String(form.get('book') ?? '0') === '1';
  const grainRaw = String(form.get('grain') ?? 'auto');
  const grain = (['auto', 'test', 'exercise', 'chunk'].includes(grainRaw) ? grainRaw : 'auto') as Grain;
  // File a mixed book by what each paper turns out to be.
  const fileByType = String(form.get('fileByType') ?? '0') === '1';
  /*
   * The opposite tick: this upload is one paper and stays one paper, however
   * many parts and skills it has. It also keeps it out of the bank — a paper
   * kept whole is one a centre means to sit whole.
   */
  const keepWhole = !book && String(form.get('keepWhole') ?? '0') === '1';
  /*
   * "The answers start on page 50." A page number is the one thing about a PDF
   * an operator can always tell you, and it beats every heuristic for finding a
   * key that prints no heading.
   */
  const pageRaw = Number(form.get('keyFromPage') ?? '');
  const keyFromPage = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : undefined;
  // Read the key with the model before the paper. On unless turned off.
  const keyFirst = String(form.get('keyFirst') ?? '1') !== '0';

  const record = await imports.create({
    orgId: ctx.org.id,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    strategy,
    // Kept so a run cut short by the platform's time limit continues on the
    // same terms rather than reverting to the defaults.
    options: {
      strategy, module, title, writeMissingAnswers, publish, bank, folder, explain, keyText,
      book, grain, fileByType, keepWhole, keyFromPage, keyFirst,
    },
  });

  /*
   * The check above happens before this row exists, so two uploads a
   * millisecond apart both pass it. Now that the row is written, ask again
   * ignoring ourselves: whoever got there first keeps the job and the loser
   * takes its row away again. A double-click should not cost two model bills.
   */
  const raced = await imports.inFlight(ctx.org.id, file.name, file.size, record.id);
  if (raced && String(form.get('again') ?? '0') !== '1') {
    await imports.remove(record.id);
    return NextResponse.json({
      error: `“${file.name}” is already being read. Wait for it to finish, or remove that import `
        + 'first if it is stuck.',
      importId: raced.id,
      inFlight: true,
    }, { status: 409 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageWarnings: string[] = [...keyWarnings];

  // Store the original first: it is what a retry reads back if the worker dies
  // mid-parse. The community bank goes to the public Hub repository; a school's
  // papers only ever go to its private targets.
  try {
    const settings = await loadStorageSettings();
    const usable = await targetsFor(ctx.org.id, ctx.org.kind);
    const targets = settings.mirrorToAll ? usable : usable.slice(0, 1);
    const storageKey = `imports/${ctx.org.id}/${record.id}/${file.name.replace(/[^\w.-]+/g, '_')}`;
    const stored: string[] = [];

    if (targets.length) {
      const results = await putObject(targets, storageKey, buffer, file.type || 'application/octet-stream');
      for (const r of results) {
        if (r.ok) stored.push(r.bucketId);
        else {
          const label = targets.find((t) => t.id === r.bucketId)?.label ?? 'a bucket';
          storageWarnings.push(`Could not store the upload in ${label}: ${r.error}`);
        }
      }
      if (stored.length) {
        await imports.update(record.id, {
          storageKey, storedIn: JSON.stringify(stored), expiresAt: await expiryFor(ctx.org.id),
        });
      }
    }
  } catch (err) {
    storageWarnings.push(`The upload could not be stored: ${(err as Error).message}`);
  }

  await imports.update(record.id, {
    status: 'queued',
    warnings: JSON.stringify(storageWarnings),
  });

  const queued = await imports.byId(record.id);
  startImport(queued ?? record, buffer, {
    strategy, module, title, orgId: ctx.org.id, userId: ctx.user.id,
    writeMissingAnswers, publish, bank, folder, explain, keyText: keyText || undefined,
    book, grain, fileByType, keepWhole, keyFromPage, keyFirst,
    ...(keepWhole ? { bank: false } : {}),
  });

  // Opportunistic tidy-up, so a deployment without a cron still expires files.
  void sweepExpired(10);

  return NextResponse.json({
    id: record.id,
    status: 'queued',
    filename: file.name,
    message: 'The upload is being read. A single paper appears in your papers when it is done, and a '
      + 'book becomes one paper per test in your bank — either way you can leave this page.',
    warnings: storageWarnings,
  }, { status: 202 });
}

/** The list the import screen polls, plus a nudge for anything left stranded. */
export async function GET() {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;
  void resumeStalled(2);
  const rows = await imports.listOrg(ctx.org.id);
  return NextResponse.json({
    imports: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      status: r.status,
      stage: importStage(r).label,
      provider: r.provider,
      percent: importStage(r).percent,
      testId: r.testId,
      testIds: JSON.parse(r.testIds || '[]'),
      kind: r.kind,
      error: r.error,
      warnings: JSON.parse(r.warnings || '[]'),
      createdAt: r.createdAt,
    })),
  });
}
