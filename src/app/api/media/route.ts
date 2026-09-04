import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { orgs } from '@/lib/db';
import { bucketById, asHfTarget } from '@/lib/storage/vault';
import { getFile } from '@/lib/storage/hf';
import { signedUrl } from '@/lib/storage/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves a stored recording to a signed-in candidate. The bytes never come from
 * a public URL: a private dataset stays private, and an S3 object is handed over
 * as a short-lived signed link rather than a permanent one.
 *
 * Range requests are answered so the browser can start playing before the whole
 * file has arrived — but the exam player never offers a way to seek.
 */
export async function GET(req: NextRequest) {
  const user = await readSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const key = params.get('key') ?? '';
  const bucketId = params.get('bucket') ?? '';
  if (!key || key.includes('..')) return NextResponse.json({ error: 'Bad key' }, { status: 400 });

  // Recordings only. Uploaded source documents live in the same store under
  // `imports/…` and contain the printed answer key, so this endpoint must never
  // be a way to read one.
  if (!key.startsWith('audio/')) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bucket = await bucketById(bucketId);
  if (!bucket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A tenant's own recordings only: the key carries the organisation that owns
  // it, and a key shaped any other way is refused rather than waved through.
  const owner = key.split('/')[1] ?? '';
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (owner !== user.orgId && !user.isPlatformAdmin) {
    // The community bank is open to everyone, so its recordings are too; a
    // school's are not.
    const org = await orgs.byId(owner);
    if (!org || org.kind === 'tenant') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (bucket.kind === 'hf') {
    const bytes = await getFile(asHfTarget(bucket), key);
    if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const range = req.headers.get('range');
    const match = range?.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : bytes.length - 1;
      const slice = bytes.subarray(start, end + 1);
      return new NextResponse(slice as unknown as BodyInit, {
        status: 206,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(slice.length),
          'content-range': `bytes ${start}-${end}/${bytes.length}`,
          'accept-ranges': 'bytes',
          'cache-control': 'private, max-age=3600',
        },
      });
    }
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'content-type': 'audio/mpeg',
        'content-length': String(bytes.length),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=3600',
      },
    });
  }

  // A bucket can serve the file itself, for a few minutes.
  const url = await signedUrl(bucket, key, 900);
  return NextResponse.redirect(url, 302);
}
