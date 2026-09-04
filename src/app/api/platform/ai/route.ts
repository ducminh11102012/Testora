import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import {
  AiConfig, AiRole, isConfigured, loadAiConfig, loadAiSettings, publicAiConfig, publicAiSettings,
  saveAiConfig, setAiUnified,
} from '@/lib/ai/config';
import { AuthStyle, WireFormat } from '@/lib/ai/models';
import { callModel } from '@/lib/ai/provider';

// The data layer needs Node, not the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard() {
  const user = await readSession();
  if (!user?.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return user;
}

const roleOf = (value: unknown): AiRole => (
  value === 'mark' ? 'mark' : value === 'vision' ? 'vision' : 'parse'
);

export async function GET() {
  const user = await guard();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ settings: publicAiSettings(await loadAiSettings()) });
}

export async function PUT(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({}));

  // The switch that merges the two providers into one, or splits them apart.
  if (body.unified !== undefined && Object.keys(body).length === 1) {
    const settings = await setAiUnified(!!body.unified);
    return NextResponse.json({ ok: true, settings: publicAiSettings(settings) });
  }

  const role = roleOf(body.role);
  const patch: Partial<AiConfig> & { apiKey?: string } = {};

  if (body.provider) patch.provider = body.provider;
  if (body.model !== undefined) patch.model = String(body.model).trim();
  if (body.apiKey !== undefined) patch.apiKey = String(body.apiKey);

  // A custom endpoint: the URL, the wire format it speaks, where the key goes,
  // and any header a gateway insists on.
  if (body.baseUrl !== undefined) {
    const url = String(body.baseUrl).trim().replace(/\/+$/, '');
    if (url) {
      let parsed: URL;
      try { parsed = new URL(url); } catch {
        return NextResponse.json({ error: 'That endpoint is not a valid URL. It should look like https://host/v1.' }, { status: 400 });
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return NextResponse.json({ error: 'The endpoint must be an http:// or https:// URL.' }, { status: 400 });
      }
    }
    patch.baseUrl = url;
  }
  if (body.wire !== undefined) {
    const wire = String(body.wire) as WireFormat;
    if (!['openai', 'anthropic', 'google'].includes(wire)) {
      return NextResponse.json({ error: 'Unknown API format.' }, { status: 400 });
    }
    patch.wire = wire;
  }
  if (body.authStyle !== undefined) {
    const style = String(body.authStyle) as AuthStyle;
    if (!['bearer', 'x-api-key', 'api-key', 'query', 'none'].includes(style)) {
      return NextResponse.json({ error: 'Unknown way of sending the key.' }, { status: 400 });
    }
    patch.authStyle = style;
  }
  if (body.extraHeaders !== undefined) {
    const raw = body.extraHeaders;
    const headers: Record<string, string> = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const name = k.trim();
        // Never let a header override the ones the driver sets itself.
        if (!name || /^(authorization|x-api-key|api-key|content-type)$/i.test(name)) continue;
        headers[name] = String(v).slice(0, 500);
      }
    }
    patch.extraHeaders = headers;
  }

  for (const flag of ['parsingEnabled', 'writingMarkingEnabled', 'transformJudgingEnabled', 'streaming'] as const) {
    if (body[flag] !== undefined) patch[flag] = !!body[flag];
  }
  if (body.monthlyBudgetCents !== undefined) patch.monthlyBudgetCents = Math.max(0, Number(body.monthlyBudgetCents) || 0);
  // 0 means "no ceiling": the request then leaves the field out altogether.
  if (body.maxOutputTokens !== undefined) patch.maxOutputTokens = Math.max(0, Math.round(Number(body.maxOutputTokens) || 0));
  if (body.markingGuidance !== undefined) patch.markingGuidance = String(body.markingGuidance).slice(0, 4000);
  if (body.price) {
    patch.price = {
      inputCentsPerMTok: Math.max(0, Number(body.price.inputCentsPerMTok) || 0),
      outputCentsPerMTok: Math.max(0, Number(body.price.outputCentsPerMTok) || 0),
    };
  }

  const settings = await saveAiConfig(patch, role);
  if (body.unified !== undefined && !!body.unified !== settings.unified) {
    return NextResponse.json({ ok: true, settings: publicAiSettings(await setAiUnified(!!body.unified)) });
  }
  return NextResponse.json({ ok: true, settings: publicAiSettings(settings) });
}

/** Sends one tiny prompt so the administrator knows a provider works. */
export async function POST(req: NextRequest) {
  const user = await guard();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => ({}));
  const role = roleOf(body.role);
  const config = await loadAiConfig(role);

  if (!isConfigured(config)) {
    return NextResponse.json({
      ok: false,
      error: config.provider === 'custom'
        ? 'Give the endpoint URL and the model name, then save, before testing.'
        : 'Choose a provider, a model and an API key first.',
    }, { status: 400 });
  }
  try {
    const result = await callModel(
      { prompt: 'Reply with exactly: {"ok":true}', json: true, maxTokens: 50 },
      { feature: 'connection-test', userId: user.id, meta: { role } },
      config,
    );
    return NextResponse.json({
      ok: true,
      role,
      model: result.model,
      endpoint: publicAiConfig(config).resolvedEndpoint,
      reply: result.text.trim().slice(0, 120),
      tokens: result.inputTokens + result.outputTokens,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, role, error: (err as Error).message }, { status: 502 });
  }
}
