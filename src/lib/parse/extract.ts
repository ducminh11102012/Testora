/**
 * Turn an uploaded file into (a) plain text for the parsers and (b) HTML when
 * the source preserves structure worth keeping (headings, lists, tables).
 */

export interface Extracted {
  text: string;
  html?: string;
  pages?: number;
  /**
   * The text of each page, in order, when the format has pages. Kept so an
   * operator who knows the answers start on page 50 can say so and have the
   * document cut exactly there — a page number is the one thing about a PDF a
   * teacher always knows and no parser can guess.
   */
  pageTexts?: string[];
  warnings: string[];
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\t/g, '  ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractDocx(buffer: Buffer): Promise<Extracted> {
  const mammoth = (await import('mammoth')).default ?? (await import('mammoth'));
  // Same care as the PDF path: a reader that ignores the offset would read a
  // pool's worth of somebody else's memory. Mammoth does not, but the copy is
  // cheap next to unzipping the file and this is not a place to be clever.
  const bytes = unpooled(buffer);
  const warnings: string[] = [];
  const htmlResult = await (mammoth as any).convertToHtml(
    { buffer: bytes },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
        // Papers underline the word being tested, so underlining is content,
        // not decoration. Mammoth drops it unless it is asked for by name.
        'u => u',
        'strike => s',
      ],
    },
  );
  const textResult = await (mammoth as any).extractRawText({ buffer: bytes });
  for (const m of htmlResult.messages ?? []) warnings.push(String(m.message ?? m));
  return { text: tidy(textResult.value ?? ''), html: htmlResult.value ?? '', warnings };
}

/**
 * Hands back bytes that own their memory, exactly.
 *
 * Node pools small buffers: a 1.6 KB PDF read from disk, or sliced out of an
 * upload, is usually a *view* into a shared 8 KB block — `byteOffset` 2544,
 * length 1667, `buffer.byteLength` 8192. The pdf.js build inside pdf-parse
 * ignores the offset and reads the whole block, so it parses 8 KB of unrelated
 * memory and fails with "bad XRef entry" or "Command token too long". Which is
 * to say: **every small PDF upload failed**, with an error that reads like a
 * corrupt file and is nothing of the sort.
 */
function unpooled(buffer: Buffer): Buffer {
  if (buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength) return buffer;
  const exact = new Uint8Array(buffer.byteLength);
  exact.set(buffer);
  return Buffer.from(exact.buffer);
}

export async function extractPdf(buffer: Buffer): Promise<Extracted> {
  /*
   * Read with pdf.js, through `unpdf` — which is pdf.js packaged to run on a
   * server without a browser or a worker.
   *
   * What was here before was `pdf-parse`, which carries a pdf.js from 2018 and
   * reads past the end of the buffer it is given. The same PDF parsed or failed
   * depending on where Node happened to put it in memory: "bad XRef entry",
   * "Command token too long: 128", errors that read like a corrupt file and are
   * nothing of the kind. It was reproduced deliberately — one throwaway
   * `Buffer.allocUnsafe(1000)` before the call turns a good read into a
   * failure — which is why no amount of re-uploading the same PDF ever helped.
   *
   * The bytes are copied into an array that owns its memory exactly, because a
   * Buffer from a file or an upload is usually a view into Node's shared pool,
   * and a reader that ignores `byteOffset` sees somebody else's memory.
   */
  const exact = new Uint8Array(buffer.byteLength);
  exact.set(buffer);

  const { extractText, getDocumentProxy } = await import('unpdf');
  const document = await getDocumentProxy(exact);
  // Page by page, then joined: the join is what the parsers read, and the
  // pages are what a "the key starts on page 50" cut needs.
  const extracted = await extractText(document, { mergePages: false });
  const pageTexts = (Array.isArray(extracted.text) ? extracted.text : [extracted.text])
    .map((page) => tidy(String(page ?? '')));
  const text = pageTexts.join('\n\n');
  const pages = document.numPages ?? (pageTexts.length || 1);

  // Poppler, when it is installed, reads a layout-heavy paper better than
  // pdf.js does — it keeps columns and answer grids apart instead of running
  // them into one line. Used only when it gives us more to work with.
  const viaPoppler = await pdfToTextTool(buffer).catch(() => null);
  if (viaPoppler && viaPoppler.replace(/\s+/g, '').length > text.replace(/\s+/g, '').length * 1.05) {
    // Poppler marks page breaks with a form feed, which is how the pages survive.
    const popplerPages = viaPoppler.split('\f').map((page) => tidy(page));
    return {
      text: tidy(popplerPages.join('\n\n')),
      pages: popplerPages.length || pages,
      pageTexts: popplerPages,
      warnings: [],
    };
  }

  return { text: tidy(text), pages, pageTexts, warnings: [] };
}

/** `pdftotext -layout` if this machine has poppler; null if it does not. */
async function pdfToTextTool(buffer: Buffer): Promise<string | null> {
  const { execFile } = await import('node:child_process');
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  const dir = await mkdtemp(join(tmpdir(), 'testora-pdf-'));
  try {
    const src = join(dir, 'in.pdf');
    const out = join(dir, 'out.txt');
    await writeFile(src, buffer);
    await run('pdftotext', ['-layout', '-enc', 'UTF-8', src, out], { timeout: 60_000 });
    return await readFile(out, 'utf8');
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function extractPlain(buffer: Buffer): Promise<Extracted> {
  return { text: tidy(buffer.toString('utf8')), warnings: [] };
}

export async function extractFile(filename: string, mime: string, buffer: Buffer): Promise<Extracted> {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'docx' || mime.includes('wordprocessingml')) return extractDocx(buffer);
  if (ext === 'pdf' || mime === 'application/pdf') return extractPdf(buffer);
  if (ext === 'doc') {
    throw new Error('Legacy .doc is not supported — please save the file as .docx or PDF first.');
  }
  if (['txt', 'md', 'rtf'].includes(ext) || mime.startsWith('text/')) return extractPlain(buffer);
  throw new Error(`Unsupported file type: ${filename}`);
}
