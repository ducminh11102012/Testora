import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ModelImage } from '../ai/provider';

const run = promisify(execFile);

/**
 * A photographed or scanned paper has no text to parse, so the pages are handed
 * to a vision model as images. Photographs are already images; a scanned PDF has
 * to be rendered, which needs poppler's `pdftoppm`. Where that is missing — a
 * bare serverless runtime, for instance — an Anthropic-shaped endpoint can take
 * the PDF whole, and anything else gets a plain explanation instead of a crash.
 */

export const MAX_PAGES = 12;

/**
 * What a provider will actually accept. Anthropic caps one image at 5 MB and a
 * request at 32 MB; OpenAI is around 20 MB for the whole body. Base64 adds a
 * third, so the budget below is deliberately conservative — and a photograph
 * over it is downscaled rather than being sent and rejected.
 */
const MAX_IMAGE_BYTES = 3_500_000;
const MAX_TOTAL_BYTES = 14_000_000;
const MAX_EDGE = 2200;

export interface PageSet {
  images: ModelImage[];
  /** Told to the operator, and passed to the model as context. */
  note: string;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function looksLikeImage(filename: string, mime: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return IMAGE_TYPES.includes(mime) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
}

/** True when a PDF carries so little text that it must be a scan. */
export function looksScanned(text: string, pages = 1): boolean {
  const perPage = text.replace(/\s+/g, ' ').trim().length / Math.max(1, pages);
  return perPage < 220;
}

async function haveTool(name: string): Promise<boolean> {
  try { await run('which', [name]); return true; } catch { return false; }
}

/**
 * Shrinks one image until a provider will take it: long edge to 2200px, then
 * JPEG quality steps. Uses ImageMagick when it is installed; without it a large
 * photograph is refused with an explanation, because sending it would only fail
 * upstream after building a 50 MB request.
 */
async function shrink(buffer: Buffer, mime: string): Promise<ModelImage> {
  if (buffer.length <= MAX_IMAGE_BYTES) {
    return { mime, base64: buffer.toString('base64') };
  }
  const tool = await haveTool('magick') ? 'magick' : await haveTool('convert') ? 'convert' : null;
  if (!tool) {
    throw new Error(
      `That image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, which is more than a vision model `
      + 'will accept, and the server has no image tools installed to shrink it. Please export the page '
      + 'at a smaller size (2000 px on the long edge is plenty) and upload it again.',
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'testora-shrink-'));
  try {
    const src = join(dir, 'in');
    await writeFile(src, buffer);
    for (const quality of [82, 68, 55]) {
      const out = join(dir, `out-${quality}.jpg`);
      await run(tool, [src, '-auto-orient', '-resize', `${MAX_EDGE}x${MAX_EDGE}>`, '-quality', String(quality), out]);
      const bytes = await readFile(out);
      if (bytes.length <= MAX_IMAGE_BYTES) {
        return { mime: 'image/jpeg', base64: bytes.toString('base64') };
      }
    }
    throw new Error('That image could not be made small enough for a vision model — try a lower-resolution photograph.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Drops pages once the request would grow past what a provider accepts. */
function withinBudget(images: ModelImage[]): { images: ModelImage[]; dropped: number } {
  const kept: ModelImage[] = [];
  let total = 0;
  for (const image of images) {
    const size = Math.ceil(image.base64.length * 0.75);
    if (total + size > MAX_TOTAL_BYTES) break;
    total += size;
    kept.push(image);
  }
  return { images: kept, dropped: images.length - kept.length };
}

/** Renders the first pages of a PDF to PNG images. */
export async function pdfToImages(buffer: Buffer, limit = MAX_PAGES): Promise<ModelImage[] | null> {
  if (!await haveTool('pdftoppm')) return null;
  const dir = await mkdtemp(join(tmpdir(), 'testora-pages-'));
  try {
    const src = join(dir, 'in.pdf');
    await writeFile(src, buffer);
    // 150 dpi is enough for a model to read print, and keeps the payload small.
    await run('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', String(limit), src, join(dir, 'page')]);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
    const images: ModelImage[] = [];
    for (const file of files.slice(0, limit)) {
      images.push({ mime: 'image/png', base64: (await readFile(join(dir, file))).toString('base64') });
    }
    return images;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * The pages to send for one upload. `wire` decides the fallback: an Anthropic
 * endpoint accepts a PDF as a document, so a missing renderer is not fatal there.
 */
export async function pagesFor(
  filename: string,
  mime: string,
  buffer: Buffer,
  wire: 'openai' | 'anthropic' | 'google',
  limit = MAX_PAGES,
): Promise<PageSet> {
  if (looksLikeImage(filename, mime)) {
    const type = IMAGE_TYPES.includes(mime) ? mime : 'image/png';
    const image = await shrink(buffer, type);
    const shrunk = image.base64.length * 0.75 < buffer.length * 0.9;
    return {
      images: [image],
      note: shrunk
        ? 'The paper is one photograph, scaled down to a size the model accepts.'
        : 'The paper is one photograph.',
    };
  }

  const rendered = await pdfToImages(buffer, limit);
  if (rendered?.length) {
    const sized = await Promise.all(rendered.map((page) => shrink(Buffer.from(page.base64, 'base64'), page.mime)));
    const { images, dropped } = withinBudget(sized);
    if (!images.length) {
      throw new Error('The first page of that scan is too large to send to a vision model. Try a lower scan resolution.');
    }
    const notes = [`The paper was rendered as ${images.length} page image(s).`];
    if (dropped || rendered.length >= limit) {
      notes.push(`Only the first ${images.length} page(s) were read — upload the rest as a second file.`);
    }
    return { images, note: notes.join(' ') };
  }

  if (wire === 'anthropic') {
    if (buffer.length > MAX_TOTAL_BYTES) {
      throw new Error(
        `That PDF is ${(buffer.length / 1024 / 1024).toFixed(1)} MB and cannot be rendered on this server, `
        + 'so it is too large to send whole. Install poppler-utils, or upload the pages as images.',
      );
    }
    return {
      images: [{ mime: 'application/pdf', base64: buffer.toString('base64') }],
      note: 'The PDF was sent whole, because no page renderer is installed on the server.',
    };
  }

  throw new Error(
    'This looks like a scan, but the server has no PDF page renderer (poppler-utils) and the vision '
    + 'endpoint cannot take a PDF directly. Upload the pages as images (PNG or JPEG), or install '
    + 'poppler-utils on the server.',
  );
}
