/**
 * Hugging Face Hub as a file store.
 *
 * A dataset repository is a git repository with an HTTP API, which is enough
 * for what the platform needs: write a file, read it back, delete it. Public
 * repositories serve the community bank straight from the Hub's CDN; private
 * ones hold a school's papers and need the token even to read.
 *
 * The documented calls used here:
 *   POST /api/repos/create                                   create the repo
 *   POST /api/datasets/{repo}/preupload/{revision}            how to send a file
 *   POST /datasets/{repo}.git/info/lfs/objects/batch          where to put a big one
 *   POST /api/datasets/{repo}/commit/{revision}   (ND-JSON)   write or delete
 *   GET  /datasets/{repo}/resolve/{revision}/{path}           read
 *
 * Why two ways to write a file. The commit endpoint takes bytes inline, base64
 * encoded, and the Hub **refuses binary content sent that way**:
 *
 *   400 Your push was rejected because it contains binary files.
 *       Please use https://huggingface.co/docs/hub/xet to store binary files.
 *
 * Which is every PDF, every .docx and every MP3 this platform stores — the
 * whole point of the store. Binary goes the way git-lfs sends it: ask the Hub
 * where to put the bytes, PUT them there, then commit a pointer. Text keeps
 * going inline, because for a 4 KB answer key that is one request instead of
 * four.
 */

import { createHash } from 'node:crypto';

/**
 * Read per call, not once at import. A self-hosted Hub is named by the
 * environment, and a module-level snapshot of that is the kind of thing that
 * works everywhere except in the one place you point it somewhere else.
 */
function host(): string {
  return process.env.HF_ENDPOINT || 'https://huggingface.co';
}

export interface HfTarget {
  token: string;
  /** `namespace/name`, the way the Hub writes it. */
  repoId: string;
  private: boolean;
  revision: string;
}

async function hf(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${host()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  });
}

/** The account a token belongs to, which is also the default namespace. */
export async function whoami(token: string): Promise<{ name: string; type: string }> {
  const res = await hf('/api/whoami-v2', token);
  if (!res.ok) throw new Error(`The token was refused (${res.status}).`);
  const data = await res.json() as { name?: string; type?: string };
  if (!data.name) throw new Error('The token did not identify an account.');
  return { name: data.name, type: data.type ?? 'user' };
}

/** Creates the dataset repository if it is not there yet. Existing is success. */
export async function ensureRepo(target: HfTarget): Promise<void> {
  const [first, second] = target.repoId.split('/');
  const body = second
    ? { type: 'dataset', name: second, organization: first, private: target.private }
    : { type: 'dataset', name: first, private: target.private };

  const res = await hf('/api/repos/create', target.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text();
  if (/already (created|exists)/i.test(text)) return;
  throw new Error(`Could not create ${target.repoId}: ${res.status} ${text.slice(0, 200)}`);
}

function commitUrl(target: HfTarget): string {
  return `/api/datasets/${target.repoId}/commit/${encodeURIComponent(target.revision || 'main')}`;
}

async function commit(target: HfTarget, lines: unknown[]): Promise<void> {
  const body = lines.map((l) => JSON.stringify(l)).join('\n');
  const res = await hf(commitUrl(target), target.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-ndjson' },
    body,
  });
  if (!res.ok) {
    throw new Error(`The Hub refused the commit: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

/**
 * The commit endpoint takes the bytes inline, base64 encoded. That is the right
 * shape for exam papers, which are small; anything past this limit belongs in
 * the backup bucket instead of being pushed through git.
 */
export const INLINE_LIMIT = 10 * 1024 * 1024;

/** Past this the Hub is the wrong place for it whichever way it is sent. */
export const UPLOAD_LIMIT = 200 * 1024 * 1024;

/**
 * Does this look like a file the Hub will refuse inline? A NUL byte in the
 * first few kilobytes is the same test git itself uses, and it is right about
 * PDFs, Word documents, MP3s and images without having to know the format.
 */
export function looksBinary(body: Buffer): boolean {
  const head = body.subarray(0, 8000);
  for (const byte of head) if (byte === 0) return true;
  return false;
}

interface UploadPlan { mode: 'lfs' | 'regular'; ignore: boolean }

/** Asks the Hub how it wants this file sent. */
async function preupload(target: HfTarget, path: string, body: Buffer): Promise<UploadPlan | null> {
  const res = await hf(
    `/api/datasets/${target.repoId}/preupload/${encodeURIComponent(target.revision || 'main')}`,
    target.token,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        files: [{ path, size: body.length, sample: body.subarray(0, 512).toString('base64') }],
      }),
    },
  );
  // An older or self-hosted Hub may not have the endpoint. Then we decide.
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) return null;
  const data = await res.json().catch(() => null) as
    { files?: Array<{ path?: string; uploadMode?: string; shouldIgnore?: boolean }> } | null;
  const file = data?.files?.find((f) => f.path === path) ?? data?.files?.[0];
  if (!file) return null;
  return { mode: file.uploadMode === 'lfs' ? 'lfs' : 'regular', ignore: !!file.shouldIgnore };
}

interface LfsAction { href: string; header?: Record<string, string> }

/**
 * The git-lfs batch dance: announce the object, get somewhere to put it, put it,
 * confirm. An object the Hub already has comes back with no upload action at
 * all — that is a hit, not a failure, and the commit can point straight at it.
 */
async function uploadLfs(target: HfTarget, path: string, body: Buffer): Promise<{ oid: string; size: number }> {
  const oid = createHash('sha256').update(body).digest('hex');
  const batch = await hf(`/datasets/${target.repoId}.git/info/lfs/objects/batch`, target.token, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.git-lfs+json',
      'content-type': 'application/vnd.git-lfs+json',
    },
    body: JSON.stringify({
      operation: 'upload',
      transfers: ['basic'],
      hash_algo: 'sha_256',
      ref: { name: `refs/heads/${target.revision || 'main'}` },
      objects: [{ oid, size: body.length }],
    }),
  });
  if (!batch.ok) {
    throw new Error(`The Hub would not take the file (lfs batch ${batch.status}): ${(await batch.text()).slice(0, 200)}`);
  }
  const data = await batch.json() as {
    objects?: Array<{
      oid?: string; size?: number; error?: { message?: string };
      actions?: { upload?: LfsAction; verify?: LfsAction };
    }>;
  };
  const object = data.objects?.[0];
  if (object?.error) throw new Error(`The Hub refused the file: ${object.error.message ?? 'no reason given'}`);

  const upload = object?.actions?.upload;
  if (upload) {
    if (upload.header?.chunk_size) {
      throw new Error(
        'The Hub asked for a multi-part upload, which means the file is far larger than a paper. '
        + 'Store files this size in an S3 or R2 bucket instead.',
      );
    }
    const put = await fetch(upload.href, {
      method: 'PUT',
      headers: {
        // A pre-signed URL is signed for the request as it stands: an extra
        // authorization header of ours would invalidate it.
        ...(upload.header ?? {}),
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array(body),
    });
    if (!put.ok) {
      throw new Error(`Uploading the file failed (${put.status}): ${(await put.text()).slice(0, 200)}`);
    }
  }

  const verify = object?.actions?.verify;
  if (verify) {
    await fetch(verify.href, {
      method: 'POST',
      headers: { 'content-type': 'application/vnd.git-lfs+json', ...(verify.header ?? {}) },
      body: JSON.stringify({ oid, size: body.length }),
    }).catch(() => undefined);
  }

  return { oid, size: body.length };
}

async function commitLfs(target: HfTarget, path: string, body: Buffer, summary: string): Promise<void> {
  const { oid, size } = await uploadLfs(target, path, body);
  await commit(target, [
    { key: 'header', value: { summary } },
    { key: 'lfsFile', value: { path, algo: 'sha256', oid, size } },
  ]);
}

/**
 * The Hub's own client, which speaks **Xet** — the content-addressed transport
 * its error message points at — and falls back to git-lfs on repositories that
 * are not Xet-enabled. It is the maintained answer to "how do I send a PDF",
 * so it goes first; everything below it is the fallback for when it is not
 * installed or cannot run (a runtime with no WASM, an air-gapped server).
 *
 * A PDF *is* binary, and nothing can change that. What changes is the door it
 * goes through.
 */
async function putViaHubClient(
  target: HfTarget,
  path: string,
  body: Buffer,
  summary: string,
): Promise<boolean> {
  if (process.env.HF_DISABLE_XET === '1') return false;
  let uploadFile: typeof import('@huggingface/hub').uploadFile;
  try {
    ({ uploadFile } = await import('@huggingface/hub'));
  } catch {
    return false;
  }
  await uploadFile({
    repo: { type: 'dataset', name: target.repoId },
    accessToken: target.token,
    hubUrl: host(),
    branch: target.revision || 'main',
    commitTitle: summary,
    useXet: true,
    file: { path, content: new Blob([new Uint8Array(body)]) },
  });
  return true;
}

export async function putFile(target: HfTarget, path: string, body: Buffer, summary: string): Promise<void> {
  if (body.length > UPLOAD_LIMIT) {
    throw new Error(`That file is ${(body.length / 1e6).toFixed(0)} MB; the Hub path takes up to ${UPLOAD_LIMIT / 1e6} MB.`);
  }
  await ensureRepo(target);

  try {
    if (await putViaHubClient(target, path, body, summary)) return;
  } catch (err) {
    /*
     * The client failed. That may be this deployment (no WASM, a proxy in the
     * way) or the repository, so the fallback below is tried before giving up —
     * and if that fails too, this is the error worth reporting, because it came
     * from the path the Hub recommends.
     */
    const first = (err as Error).message;
    try {
      await putFileDirect(target, path, body, summary);
      return;
    } catch (second) {
      throw new Error(`${first} (and the git-lfs fallback also failed: ${(second as Error).message})`);
    }
  }

  await putFileDirect(target, path, body, summary);
}

/**
 * The same job done with nothing but `fetch`: preupload to ask how the file
 * should be sent, git-lfs for binary, an inline commit for text. Kept because
 * a school's server should not need a WASM chunker to store an answer key.
 */
export async function putFileDirect(
  target: HfTarget,
  path: string,
  body: Buffer,
  summary: string,
): Promise<void> {
  const plan = await preupload(target, path, body);
  const asLfs = plan
    ? plan.mode === 'lfs'
    // No preupload to ask: anything binary, or too big to base64 into a
    // request, goes the lfs way on our own judgement.
    : looksBinary(body) || body.length > INLINE_LIMIT;

  if (asLfs) {
    await commitLfs(target, path, body, summary);
    return;
  }

  try {
    await commit(target, [
      { key: 'header', value: { summary } },
      { key: 'file', value: { path, content: body.toString('base64'), encoding: 'base64' } },
    ]);
  } catch (err) {
    /*
     * The Hub decided it was binary after all — its sniffing is not ours, and
     * a .txt of exam text can carry a stray control byte. Send it the other
     * way rather than telling the operator their paper could not be stored.
     */
    const message = (err as Error).message;
    if (!/binary file|xet|lfs/i.test(message)) throw err;
    await commitLfs(target, path, body, summary);
  }
}

export async function deleteFile(target: HfTarget, path: string): Promise<void> {
  try {
    await commit(target, [
      { key: 'header', value: { summary: `Delete ${path}` } },
      { key: 'deletedFile', value: { path } },
    ]);
  } catch (err) {
    // A file that is already gone is the outcome we wanted anyway.
    if (/not found|does not exist/i.test((err as Error).message)) return;
    throw err;
  }
}

/** Where the file can be read. Public repos need no token; private ones do. */
export function fileUrl(target: HfTarget, path: string): string {
  const rev = encodeURIComponent(target.revision || 'main');
  return `${host()}/datasets/${target.repoId}/resolve/${rev}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export async function getFile(target: HfTarget, path: string): Promise<Buffer | null> {
  const res = await hf(
    `/datasets/${target.repoId}/resolve/${encodeURIComponent(target.revision || 'main')}/${path}`,
    target.token,
    // Followed by hand, because of what the redirect points at — see below.
    { redirect: 'manual' },
  );

  /*
   * A file stored the git-lfs way is not served by the Hub itself: `resolve`
   * answers 302 to a pre-signed URL on its CDN. That URL is signed for a
   * request with no Authorization header, and object stores reject a request
   * that carries both a signature and a token — so the hop is made bare.
   */
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw new Error(`Could not read ${path}: the Hub redirected nowhere.`);
    const next = await fetch(new URL(location, `${host()}/`), { cache: 'no-store' });
    if (next.status === 404) return null;
    if (!next.ok) throw new Error(`Could not read ${path}: ${next.status}`);
    return Buffer.from(await next.arrayBuffer());
  }

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read ${path}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Writes a probe file and removes it, which is the only honest connection test. */
export async function testTarget(target: HfTarget): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await whoami(target.token);
    await ensureRepo(target);
    const probe = `.testora/probe-${Date.now()}.txt`;
    await putFile(target, probe, Buffer.from('testora'), 'Connection test');
    await deleteFile(target, probe);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
