import { NextRequest, NextResponse } from 'next/server';
import { authenticate, createSession, setSessionCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { login, password } = await req.json().catch(() => ({}));
  if (!login || !password) return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400 });

  const user = authenticate(String(login), String(password));
  if (!user) return NextResponse.json({ error: 'That username or password is not correct.' }, { status: 401 });

  setSessionCookie(await createSession(user));
  return NextResponse.json({ ok: true, role: user.role, orgSlug: user.orgSlug });
}
