import { NextRequest } from 'next/server';
import { imports } from '@/lib/db';
import { isResponse, sameOrg, staffContext } from '@/lib/api-guard';
import { importStage } from '@/lib/import-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long enough to watch a paper being read; the client reconnects for a book.
export const maxDuration = 300;

/** How often the job's state is looked at. */
const TICK_MS = 600;
/** A stream is closed after this, and the client opens another. */
const MAX_MS = 240_000;

/**
 * Watches one import as it happens.
 *
 * Reading a paper takes a minute or two of somebody else's compute, and a
 * spinner for two minutes is indistinguishable from a spinner for ever. This
 * sends what the job has got to — the stage, how far along, and the end of what
 * the model is actually writing — as it changes.
 *
 * The job runs in a different process (it may be a different machine
 * altogether on a serverless host), so its state travels through the import
 * row: the worker writes progress there, and this reads it. That is also why
 * the connection can drop and be reopened without losing anything.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await staffContext();
  if (isResponse(ctx)) return ctx;

  const record = await imports.metaById(params.id);
  if (!record || !await sameOrg(ctx, record.orgId)) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastSent = '';
      let open = true;

      const send = (event: string, data: unknown) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const close = () => {
        if (!open) return;
        open = false;
        try { controller.close(); } catch { /* already gone */ }
      };

      while (open) {
        const fresh = await imports.metaById(params.id).catch(() => null);
        if (!fresh) { send('gone', { id: params.id }); close(); break; }

        const stage = importStage(fresh);
        const payload = {
          id: fresh.id,
          status: fresh.status,
          stage: stage.label,
          percent: stage.percent,
          done: stage.progress.done,
          total: stage.progress.total,
          paper: stage.progress.label ?? null,
          chars: stage.progress.chars ?? 0,
          // The end of the model's reply. It is JSON in mid-flight, so it looks
          // like what it is: work in progress, not a finished paper.
          tail: stage.progress.tail ?? '',
          testIds: JSON.parse(fresh.testIds || '[]') as string[],
          error: fresh.error,
        };

        // Only when something changed, so an idle job costs one comparison.
        const signature = JSON.stringify(payload);
        if (signature !== lastSent) {
          lastSent = signature;
          send('progress', payload);
        }

        if (fresh.status === 'committed' || fresh.status === 'failed') {
          send('finished', payload);
          close();
          break;
        }
        if (Date.now() - started > MAX_MS) {
          // Not an error: the client is told to come back for the rest.
          send('reconnect', { id: fresh.id });
          close();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, TICK_MS));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nginx and some proxies hold a response back until it is complete.
      'x-accel-buffering': 'no',
    },
  });
}
