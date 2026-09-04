import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { loadHfAuth, publicHfAuth, saveHfAuth } from '@/lib/auth-hf/config';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const user = await readSession();
  return user?.isPlatformAdmin ? user : null;
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ config: publicHfAuth(await loadHfAuth()) });
}

export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {
    enabled: !!body.enabled,
    tokenSignIn: !!body.tokenSignIn,
    allowSignup: body.allowSignup !== false,
    extraScopes: String(body.extraScopes ?? '').trim(),
  };
  if (typeof body.clientId === 'string') patch.clientId = body.clientId.trim();
  // An empty secret means "public app"; only overwrite when something is typed.
  if (typeof body.clientSecret === 'string' && body.clientSecret) patch.clientSecret = body.clientSecret;
  if (body.clearSecret) patch.clientSecret = '';

  return NextResponse.json({ ok: true, config: publicHfAuth(await saveHfAuth(patch)) });
}
