/**
 * Turn an uploaded file into (a) plain text for the parsers and (b) HTML when
 * the source preserves structure worth keeping (headings, lists, tables).
 */

export interface Extracted {
  text: string;
  html?: string;
  pages?: number;
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
  const warnings: string[] = [];
  const htmlResult = await (mammoth as any).convertToHtml(
    { buffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h2:fresh",
        "p[style-name='Heading 2'] => h3:fresh",
        "p[style-name='Title'] => h1:fresh",
      ],
    },
  );
  const textResult = await (mammoth as any).extractRawText({ buffer });
  for (const m of htmlResult.messages ?? []) warnings.push(String(m.message ?? m));
  return { text: tidy(textResult.value ?? ''), html: htmlResult.value ?? '', warnings };
}

export async function extractPdf(buffer: Buffer): Promise<Extracted> {
  // The package root runs a self-test on import; the lib entry does not.
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (
    b: Buffer,
  ) => Promise<{ text: string; numpages: number }>;
  const result = await pdfParse(buffer);
  return { text: tidy(result.text), pages: result.numpages, warnings: [] };
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
