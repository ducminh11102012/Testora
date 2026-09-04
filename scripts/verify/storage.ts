/**
 * Can a PDF actually be stored?
 *
 * The Hugging Face Hub refuses binary content sent inline in a commit:
 *
 *   400 Your push was rejected because it contains binary files.
 *       Please use https://huggingface.co/docs/hub/xet to store binary files.
 *
 * That is every PDF, every .docx and every MP3 the platform keeps, so the store
 * has a second way in — the one git-lfs uses: ask where the bytes go, PUT them
 * there, commit a pointer. Three Hubs are started here, each behaving like a
 * different real one, and the same driver is pointed at all three:
 *
 *   1. a current Hub, which says "lfs" when asked
 *   2. a Hub with no preupload endpoint at all, so the driver must decide
 *   3. a Hub that says "regular" and then refuses the commit — the message
 *      above, which is how this was found in the first place
 *
 * The real write path is the Hub's own client (Xet, falling back to lfs); these
 * fakes speak the lfs half of that, so `putFile` is checked against them too —
 * that is the same door, taken by the maintained client rather than by hand.
 *
 * Nothing else is needed: no database, no network, no token.
 */

import { createHash } from 'node:crypto';
import { IncomingMessage, Server, ServerResponse, createServer } from 'node:http';
import { check, equal, report, suite } from './harness';

type Manner = 'current' | 'no-preupload' | 'refuses-inline';

interface Hub {
  server: Server;
  /** The object store the Hub hands out pre-signed URLs for, on its own origin. */
  store: Server;
  port: number;
  /** Files as the Hub ended up holding them. */
  files: Map<string, Buffer>;
  /** What was asked of it, in order. */
  log: string[];
}

function read(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

const BINARY_REFUSAL = 'Your push was rejected because it contains binary files. '
  + 'Please use https://huggingface.co/docs/hub/xet to store binary files.';

async function hub(manner: Manner, port: number): Promise<Hub> {
  const files = new Map<string, Buffer>();
  const pointers = new Set<string>();
  const staged = new Map<string, Buffer>();
  const log: string[] = [];
  // The object store is a different origin, as S3 is: a client that attaches
  // the Hub token to a pre-signed PUT would be caught here.
  const storePort = port + 100;

  const store = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const m = url.pathname.match(/^\/put\/([0-9a-f]{64})$/);
    if (m && req.method === 'PUT') {
      const bytes = await read(req);
      if (req.headers.authorization) {
        res.writeHead(403, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'a token on a pre-signed PUT invalidates the signature' }));
      }
      if (createHash('sha256').update(bytes).digest('hex') !== m[1]) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'the bytes do not match the oid' }));
      }
      staged.set(m[1], bytes);
      log.push(`put ${bytes.length}`);
      res.writeHead(200, { etag: `"${m[1].slice(0, 16)}"` });
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => store.listen(storePort, '127.0.0.1', resolve));

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let m: RegExpMatchArray | null;

    if (url.pathname === '/api/repos/create') { await read(req); return json(409, { error: 'already exists' }); }

    if (/\/preupload\//.test(url.pathname)) {
      const body = JSON.parse((await read(req)).toString() || '{}') as
        { files?: Array<{ path: string; size: number; sample: string }> };
      if (manner === 'no-preupload') { log.push('preupload 404'); return json(404, { error: 'no such route' }); }
      const answered = (body.files ?? []).map((f) => {
        const sample = Buffer.from(f.sample ?? '', 'base64');
        const binary = manner === 'current' && (sample.includes(0) || f.size > 10 * 1024 * 1024);
        return { path: f.path, uploadMode: binary ? 'lfs' : 'regular', shouldIgnore: false };
      });
      log.push(`preupload ${answered.map((a) => a.uploadMode).join(',')}`);
      return json(200, { files: answered });
    }

    if (/\/info\/lfs\/objects\/batch$/.test(url.pathname)) {
      const body = JSON.parse((await read(req)).toString() || '{}') as
        { objects?: Array<{ oid: string; size: number }>; hash_algo?: string };
      const object = body.objects?.[0];
      log.push(`batch ${body.hash_algo}`);
      return json(200, {
        transfer: 'basic',
        objects: [{
          oid: object?.oid,
          size: object?.size,
          actions: { upload: { href: `http://127.0.0.1:${storePort}/put/${object?.oid}` } },
        }],
      });
    }

    if (/\/commit\//.test(url.pathname)) {
      const lines = (await read(req)).toString().trim().split('\n').filter(Boolean)
        .map((l) => JSON.parse(l) as { key: string; value: Record<string, string> });
      for (const line of lines) {
        if (line.key === 'file') {
          const bytes = Buffer.from(line.value.content, 'base64');
          if (bytes.includes(0) || manner === 'refuses-inline') {
            log.push('refused inline');
            return json(400, { error: BINARY_REFUSAL });
          }
          log.push('commit inline');
          files.set(line.value.path, bytes);
        } else if (line.key === 'lfsFile') {
          const bytes = staged.get(line.value.oid);
          if (!bytes) return json(400, { error: 'that object was never uploaded' });
          log.push('commit pointer');
          files.set(line.value.path, bytes);
          pointers.add(line.value.path);
        }
      }
      return json(200, { commitOid: 'abc' });
    }

    m = url.pathname.match(/^\/datasets\/.+\/resolve\/[^/]+\/(.+)$/);
    if (m) {
      const wanted = decodeURIComponent(m[1]);
      const bytes = files.get(wanted);
      if (!bytes) return json(404, { error: 'not found' });
      // A pointer file is served the way the Hub serves one: a redirect to a
      // signed URL that must be fetched *without* the token.
      if (pointers.has(wanted)) {
        log.push('redirect to cdn');
        res.writeHead(302, { location: `http://127.0.0.1:${port}/cdn/${encodeURIComponent(wanted)}?sig=abc` });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      return res.end(bytes);
    }

    m = url.pathname.match(/^\/cdn\/(.+)$/);
    if (m) {
      if (req.headers.authorization) return json(400, { error: 'a token alongside a signature is refused' });
      const bytes = files.get(decodeURIComponent(m[1]));
      if (!bytes) return json(404, { error: 'not found' });
      log.push('served from cdn');
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      return res.end(bytes);
    }
    return json(404, { error: 'no route' });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { server, store, port, files, log };
}

/** A PDF is a text header, a pile of NUL bytes and a compressed stream. */
const PDF = Buffer.concat([
  Buffer.from('%PDF-1.7\n1 0 obj\n'), Buffer.alloc(4096), Buffer.from('stream\nendstream\n%%EOF'),
]);
const KEY_FILE = Buffer.from('ANSWER KEY\n1. A  2. B  3. C\n', 'utf8');
const RECORDING = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(11 * 1024 * 1024, 9)]);

async function main(): Promise<void> {
  const hubs = {
    current: await hub('current', 14580),
    old: await hub('no-preupload', 14581),
    fussy: await hub('refuses-inline', 14582),
  };

  try {
    for (const [name, one] of Object.entries(hubs)) {
      process.env.HF_ENDPOINT = `http://127.0.0.1:${one.port}`;
      const hf = await import('../../src/lib/storage/hf');
      const target = { token: 'hf_test', repoId: 'school/papers', private: true, revision: 'main' };

      const label = name === 'current' ? 'A current Hub'
        : name === 'old' ? 'A Hub with no preupload endpoint'
          : 'A Hub that refuses the commit it invited';
      suite(label);

      await hf.putFileDirect(target, 'imports/a/paper.pdf', PDF, 'Upload a paper');
      const pdfBack = await hf.getFile(target, 'imports/a/paper.pdf');
      check('a PDF is stored', !!pdfBack && pdfBack.equals(PDF),
        `log: ${one.log.join(' → ')}`);
      check('and it went as a pointer, not inline', one.log.includes('commit pointer'),
        one.log.join(' → '));
      check('the bytes were uploaded whole', one.log.includes(`put ${PDF.length}`), one.log.join(' → '));
      check('and reading it back followed the redirect to the CDN, bare',
        one.log.includes('redirect to cdn') && one.log.includes('served from cdn'),
        one.log.join(' → '));

      const before = one.log.length;
      await hf.putFileDirect(target, 'imports/a/key.txt', KEY_FILE, 'Upload a key');
      const keyBack = await hf.getFile(target, 'imports/a/key.txt');
      check('a text key is stored too', !!keyBack && keyBack.equals(KEY_FILE));
      const textLog = one.log.slice(before);
      if (name === 'fussy') {
        check('a Hub that refuses everything inline takes even text the other way',
          textLog.includes('commit pointer'), textLog.join(' → '));
      } else {
        check('and text still goes inline, in one request',
          textLog.includes('commit inline') && !textLog.includes('commit pointer'),
          textLog.join(' → '));
      }

      await hf.putFileDirect(target, 'audio/a/paper.mp3', RECORDING, 'Upload a recording');
      const audioBack = await hf.getFile(target, 'audio/a/paper.mp3');
      equal('an 11 MB recording is stored', audioBack?.length ?? 0, RECORDING.length);
    }

    suite("The Hub's own client, on a Hub that speaks lfs");
    process.env.HF_ENDPOINT = `http://127.0.0.1:${hubs.current.port}`;
    {
      const hf = await import('../../src/lib/storage/hf');
      const target = { token: 'hf_test', repoId: 'school/papers', private: true, revision: 'main' };
      const before = hubs.current.log.length;
      let failure = '';
      await hf.putFile(target, 'imports/b/paper.pdf', PDF, 'Upload a paper')
        .catch((err) => { failure = (err as Error).message; });
      const back = await hf.getFile(target, 'imports/b/paper.pdf');
      check('a PDF goes up through it', !!back && back.equals(PDF), failure);
      const trail = hubs.current.log.slice(before);
      check('and the bytes went to the object store, not into the commit',
        trail.includes(`put ${PDF.length}`) && trail.includes('commit pointer'), trail.join(' → '));
      // One upload, not two: a failed first attempt that silently falls back
      // would still store the file and cost twice the bandwidth.
      equal('the file was uploaded once', trail.filter((l) => l.startsWith('put ')).length, 1);
    }

    suite('What the store will not pretend to do');
    process.env.HF_ENDPOINT = `http://127.0.0.1:${hubs.current.port}`;
    const hf = await import('../../src/lib/storage/hf');
    check('a PDF is recognised as binary', hf.looksBinary(PDF));
    check('an answer key is not', !hf.looksBinary(KEY_FILE));
    let refused = '';
    await hf.putFile(
      { token: 'hf_test', repoId: 'school/papers', private: true, revision: 'main' },
      'huge.bin', Buffer.alloc(hf.UPLOAD_LIMIT + 1), 'Too big',
    ).catch((err) => { refused = (err as Error).message; });
    check('a file past the ceiling is refused with its size in the message',
      /MB/.test(refused), refused || 'it was accepted');
  } finally {
    for (const one of Object.values(hubs)) { one.server.close(); one.store.close(); }
  }

  report();
}

void main();
