/**
 * Does a custom endpoint really get streaming — and does the driver cope when
 * that endpoint mistreats the request?
 *
 * `custom` is not a fourth wire. It speaks one of the three (OpenAI,
 * Anthropic, Google) with whatever URL, key placement and model name the
 * console was given, so streaming reaches a self-hosted server or a gateway by
 * the same path as a hosted provider. What differs is how badly the thing at
 * the other end behaves, and that is what this checks: three endpoints that
 * each go wrong differently, plus one that behaves.
 *
 * The endpoints are started here rather than being fixtures somewhere else, so
 * this is one command and there is nothing to remember to run first. It needs a
 * database, because every model call is metered.
 */

import { createServer, Server } from 'node:http';
import { check, equal, report, suite } from './harness';
import { callModel } from '../../src/lib/ai/provider';
import { askJson } from '../../src/lib/ai/ask-json';
import { AI_FALLBACK } from '../../src/lib/ai/models';
import { encryptSecret } from '../../src/lib/ai/secret';
import { databaseReady } from '../../src/lib/db';

type Behaviour = 'streams' | 'rejects-stream-options' | 'ignores-stream' | 'empty-stream'
  | 'refuses-stream'
  /** Answers with prose the first time and JSON only when asked in words. */
  | 'prose-then-json'
  /** A reasoning model that spends its whole budget thinking. */
  | 'reasoning-only'
  /** Refuses `temperature` and `max_tokens`, the way the newer models do. */
  | 'fussy-parameters'
  /** 429 once, then fine — a rate limit that a retry gets past. */
  | 'busy-once'
  /** Allows exactly one request at a time, like the free tiers do. */
  | 'strict-single';

const PAPER = JSON.stringify({
  title: 'Wire probe paper',
  module: 'reading',
  variant: 'academic',
  durationMinutes: 30,
  parts: [{
    title: 'Part 1',
    section: null,
    instructions: 'Answer.',
    passage: null,
    groups: [{
      type: 'multiple-choice',
      heading: 'Questions 1-3',
      instructions: 'Choose.',
      bank: null,
      bodyHtml: null,
      fieldColumns: null,
      questions: [1, 2, 3].map((n) => ({
        number: n,
        prompt: `Question ${n}?`,
        options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }],
        answers: ['A'],
        points: 1,
      })),
    }],
  }],
});

interface Fixture {
  server: Server;
  port: number;
  /** Whether each request that arrived asked for a stream, and how. */
  seen: Array<{ stream: boolean; streamOptions: boolean; jsonMode?: boolean }>;
  /** What the endpoint noticed about how it was called. */
  state: { calls: number; inFlight: number; overlapped: boolean };
}

/** One pretend endpoint, misbehaving to order. */
function start(port: number, behaviour: Behaviour): Promise<Fixture> {
  const seen: Fixture['seen'] = [];
  const state = { calls: 0, inFlight: 0, overlapped: false };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed: { stream?: boolean; stream_options?: unknown; response_format?: unknown } = {};
      try { parsed = JSON.parse(body); } catch { parsed = {}; }
      seen.push({
        stream: !!parsed.stream,
        streamOptions: !!parsed.stream_options,
        jsonMode: !!parsed.response_format,
      });

      if (behaviour === 'prose-then-json') {
        // The first ask carries the wire's JSON mode and gets an apology; the
        // second, asked in plain words, gets the paper. Which is exactly the
        // shape of the servers this fallback exists for.
        const answer = parsed.response_format
          ? "I'm sorry, but I can't help with that request."
          : PAPER;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 90, completion_tokens: 40 },
        }));
        return;
      }
      if (behaviour === 'busy-once') {
        state.calls += 1;
        if (state.calls === 1) {
          res.writeHead(429, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              code: 'concurrency_limit_exceeded',
              message: 'Too many concurrent requests (limit: 1)',
              limit: 1,
              role: 'free',
            },
          }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: PAPER }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 90, completion_tokens: 40 },
        }));
        return;
      }
      if (behaviour === 'strict-single') {
        state.inFlight += 1;
        if (state.inFlight > 1) {
          state.overlapped = true;
          state.inFlight -= 1;
          res.writeHead(429, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: { code: 'concurrency_limit_exceeded', message: 'Too many concurrent requests (limit: 1)', limit: 1 },
          }));
          return;
        }
        setTimeout(() => {
          state.inFlight -= 1;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: PAPER }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 90, completion_tokens: 40 },
          }));
        }, 120);
        return;
      }
      if (behaviour === 'fussy-parameters') {
        const bad = (parsed as { temperature?: number; max_tokens?: number });
        if (bad.temperature !== undefined && bad.temperature !== 1) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) is supported." },
          }));
          return;
        }
        if (bad.max_tokens !== undefined) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." },
          }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: PAPER }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 90, completion_tokens: 40 },
        }));
        return;
      }
      if (behaviour === 'reasoning-only') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              content: '',
              reasoning_content: 'Let me think about this paper. '.repeat(60),
            },
            finish_reason: 'length',
          }],
          usage: { prompt_tokens: 90, completion_tokens: 2000 },
        }));
        return;
      }

      if (behaviour === 'rejects-stream-options' && parsed.stream_options) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Unrecognized request argument supplied: stream_options' } }));
        return;
      }
      if (behaviour === 'refuses-stream' && parsed.stream) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'streaming is not supported by this deployment' } }));
        return;
      }
      if (behaviour === 'empty-stream' && parsed.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(': keep-alive\n\n');
        setTimeout(() => { res.write('data: [DONE]\n\n'); res.end(); }, 80);
        return;
      }
      if (behaviour === 'streams' && parsed.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
        const size = 240;
        let at = 0;
        const tick = () => {
          if (at >= PAPER.length) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 90, completion_tokens: 40 } })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: PAPER.slice(at, at + size) } }] })}\n\n`);
          at += size;
          setTimeout(tick, 20);
        };
        tick();
        return;
      }
      // Everything else — including "ignores-stream" — answers plainly.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: PAPER } }],
        usage: { prompt_tokens: 90, completion_tokens: 40 },
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port, seen, state }));
  });
}

interface Attempt {
  ok: boolean;
  text: string;
  pieces: number;
  live: number;
  error?: string;
}

async function ask(port: number, withKey: boolean, streaming = true): Promise<Attempt> {
  let pieces = 0;
  let live = 0;
  try {
    const result = await callModel(
      {
        prompt: 'RAW TEXT OF THE PAPER\n---\nA short paper.\n1. A?\n---',
        system: 'JSON only.',
        json: true,
        ...(streaming ? { onDelta: (chunk: string) => { pieces += 1; live += chunk.length; } } : {}),
      },
      { feature: 'connection-test', orgId: null, userId: null },
      {
        ...AI_FALLBACK,
        provider: 'custom',
        wire: 'openai',
        authStyle: withKey ? 'bearer' : 'none',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'probe-model',
        apiKeyEnc: withKey ? encryptSecret('probe-key') : '',
      },
    );
    return { ok: result.text.trim().startsWith('{'), text: result.text, pieces, live };
  } catch (err) {
    return { ok: false, text: '', pieces, live, error: (err as Error).message };
  }
}

/** The same call, but through the JSON asker the parser uses. */
async function askFor(
  port: number,
  extra: { temperature?: number; maxTokens?: number } = {},
): Promise<{ ok: boolean; warnings: string[]; error?: string }> {
  try {
    const asked = await askJson(
      {
        prompt: 'RAW TEXT OF THE PAPER\n---\nA short paper.\n1. A?\n---',
        system: 'JSON only.',
        ...extra,
      },
      { feature: 'connection-test', orgId: null, userId: null },
      {
        ...AI_FALLBACK,
        provider: 'custom',
        wire: 'openai',
        authStyle: 'none',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: 'probe-model',
        apiKeyEnc: '',
      },
    );
    const value = asked.value as { title?: string };
    return { ok: typeof value?.title === 'string', warnings: asked.warnings };
  } catch (err) {
    return { ok: false, warnings: [], error: (err as Error).message };
  }
}

async function main(): Promise<void> {
  const ready = await databaseReady();
  if (!ready.ok) {
    process.stdout.write(
      `No database to meter the calls against (${ready.reason}). Set DATABASE_URL and run this again.\n`,
    );
    process.exit(0);
  }

  const fixtures = {
    streams: await start(14570, 'streams'),
    rejectsOptions: await start(14571, 'rejects-stream-options'),
    ignores: await start(14572, 'ignores-stream'),
    empty: await start(14573, 'empty-stream'),
    refuses: await start(14574, 'refuses-stream'),
    prose: await start(14575, 'prose-then-json'),
    thinking: await start(14576, 'reasoning-only'),
    fussy: await start(14577, 'fussy-parameters'),
    busy: await start(14578, 'busy-once'),
    single: await start(14579, 'strict-single'),
  };

  try {
    suite('A custom endpoint that streams properly');
    const good = await ask(fixtures.streams.port, false);
    check('the paper comes back', good.ok, good.error ?? good.text.slice(0, 80));
    check('and it arrived in pieces', good.pieces > 1, `${good.pieces} pieces`);
    check('every character of it', good.live === good.text.length, `${good.live} live vs ${good.text.length} total`);

    suite('An endpoint that rejects the stream_options field');
    const strict = await ask(fixtures.rejectsOptions.port, false);
    check('the paper still comes back', strict.ok, strict.error ?? '');
    equal('asked twice: streamed, then plainly',
      fixtures.rejectsOptions.seen.map((s) => (s.stream ? 'streamed' : 'plain')), ['streamed', 'plain']);

    suite('An endpoint that refuses a streamed request outright');
    const refused = await ask(fixtures.refuses.port, false);
    check('the paper still comes back', refused.ok, refused.error ?? '');
    equal('asked twice: streamed, then plainly',
      fixtures.refuses.seen.map((s) => (s.stream ? 'streamed' : 'plain')), ['streamed', 'plain']);

    suite('An endpoint that says yes and answers plainly anyway');
    const ignoring = await ask(fixtures.ignores.port, false);
    check('the paper comes back', ignoring.ok, ignoring.error ?? '');
    equal('and it was only asked once', fixtures.ignores.seen.length, 1);
    equal('nothing was reported as streamed', ignoring.pieces, 0);

    suite('An endpoint that opens a stream and sends nothing');
    const hollow = await ask(fixtures.empty.port, false);
    check('the paper still comes back', hollow.ok, hollow.error ?? '');
    equal('asked twice: streamed, then plainly',
      fixtures.empty.seen.map((s) => (s.stream ? 'streamed' : 'plain')), ['streamed', 'plain']);

    suite('An endpoint that answers with prose instead of JSON');
    {
      const asked = await askFor(fixtures.prose.port);
      check('the paper still comes back', asked.ok, asked.error ?? '');
      equal('it was asked twice', fixtures.prose.seen.length, 2);
      equal('the first ask used the wire\'s JSON mode, the second did not',
        fixtures.prose.seen.map((s) => !!s.jsonMode), [true, false]);
      check('and the notes say the second attempt is where the paper came from',
        asked.warnings.some((w) => /second attempt/i.test(w)), asked.warnings.join(' | '));
    }

    suite('A reasoning model that never gets to the answer');
    {
      const asked = await askFor(fixtures.thinking.port);
      check('the failure is reported, not swallowed', !asked.ok);
      check('and it says the model only produced reasoning',
        /reasoning/i.test(asked.error ?? ''), asked.error ?? '');
      check('and that it ran out of output budget',
        /output budget/i.test(asked.error ?? ''), asked.error ?? '');
    }

    suite('A model that refuses the parameters it was sent');
    {
      const asked = await askFor(fixtures.fussy.port, { temperature: 0, maxTokens: 4096 });
      check('the paper comes back anyway', asked.ok, asked.error ?? '');
      check('after the offending fields were dropped one at a time',
        fixtures.fussy.seen.length >= 3, `${fixtures.fussy.seen.length} requests`);
    }

    suite('An endpoint that says "too many requests"');
    {
      const asked = await ask(fixtures.busy.port, false, false);
      check('the paper comes back after the wait', asked.ok, asked.error ?? '');
      check('and it took two asks to get it', fixtures.busy.state.calls === 2,
        `${fixtures.busy.state.calls} calls`);
    }

    suite('An endpoint that allows one request at a time');
    {
      // Three papers at once, the way a book's papers arrive. Nothing here
      // knows about the endpoint's limit; the driver's own lane is what keeps
      // them from overlapping.
      const all = await Promise.all([
        ask(fixtures.single.port, false, false),
        ask(fixtures.single.port, false, false),
        ask(fixtures.single.port, false, false),
      ]);
      check('all three come back', all.every((a) => a.ok), all.map((a) => a.error ?? 'ok').join(' | '));
      check('and the endpoint never saw two at once', !fixtures.single.state.overlapped);
    }

    suite('Streaming turned off for a provider');
    const quiet = await ask(fixtures.streams.port, false, false);
    check('the paper comes back', quiet.ok, quiet.error ?? '');
    check('and nothing was streamed', quiet.pieces === 0);
    check('the endpoint was asked plainly',
      fixtures.streams.seen.slice(-1)[0]?.stream === false,
      JSON.stringify(fixtures.streams.seen.slice(-1)[0]));
  } finally {
    for (const fixture of Object.values(fixtures)) fixture.server.close();
  }

  report();
}

void main();
