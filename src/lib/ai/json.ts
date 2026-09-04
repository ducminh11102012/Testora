/**
 * Reading JSON back from a model.
 *
 * A long exam paper is a long JSON document, and a model asked for one will
 * sometimes run out of output budget in the middle of it. `JSON.parse` then
 * throws and — before this file existed — an entire successful parse of eighty
 * questions was thrown away over a missing bracket at the end.
 *
 * So the reply is repaired instead: strings and containers left open are closed,
 * a half-written element is dropped, and what the model did manage to produce is
 * used, with the shortfall reported rather than hidden.
 */

export interface ModelJson {
  value: unknown;
  /** True when brackets had to be closed or a trailing element dropped. */
  repaired: boolean;
  /** True when the reply ended mid-structure — the model ran out of room. */
  truncated: boolean;
}

/** Strips code fences and any prose either side of the JSON object. */
function isolate(raw: string): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const first = s.search(/[{[]/);
  if (first === -1) throw new Error('The model did not return JSON.');
  return s.slice(first).trimEnd();
}

/**
 * Walks the reply once, remembering the last point at which the document was
 * *safe to cut* — immediately after a complete element inside a container, where
 * a comma could legally have followed — along with the containers open at that
 * moment. A truncated reply is then cut back to that point and closed off, which
 * turns "the last question is half-written" into "the last question is missing"
 * rather than into a parse error over the whole paper.
 */
function repair(text: string): { text: string; truncated: boolean } {
  const stack: string[] = [];
  /** Cut point, and the containers open there. */
  let safeAt = -1;
  let safeStack: string[] = [];
  let completeAt = -1;

  const markSafe = (index: number) => {
    // Only inside a container: cutting at top level is what `completeAt` is for.
    if (stack.length) { safeAt = index; safeStack = [...stack]; }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // ---- string ----------------------------------------------------------
    if (ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') { closed = true; break; }
        j += 1;
      }
      if (!closed) break;                     // the reply ends inside a string
      // A string followed by a colon is a key, not a value. A string with
      // nothing after it at all is ambiguous — it may be a key whose value was
      // never written — so it is not treated as a safe place to stop.
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k += 1;
      if (k < text.length && text[k] !== ':') markSafe(j);
      i = j + 1;
      continue;
    }

    // ---- containers ------------------------------------------------------
    if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); i += 1; continue; }
    if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) stack.pop();
      if (stack.length) markSafe(i);
      else completeAt = i;
      i += 1;
      continue;
    }

    // ---- number, true, false, null --------------------------------------
    if (/[-\d]/.test(ch) || /[tfn]/.test(ch)) {
      let j = i;
      while (j < text.length && /[-+.eE\dtruefalsn]/.test(text[j])) j += 1;
      // Only safe if something follows it: a value at the very end may be cut.
      if (j < text.length) markSafe(j - 1);
      i = j;
      continue;
    }

    i += 1;
  }

  if (!stack.length && completeAt >= 0) return { text: text.slice(0, completeAt + 1), truncated: false };

  if (safeAt < 0) {
    // Nothing inside any container finished, so there is nothing to keep but
    // the shell. Trim back past a half-written string or a key with no value,
    // then close whatever is still open.
    let body = text;

    // An unterminated string goes entirely, quote and all.
    const openQuote = lastOpenStringStart(body);
    if (openQuote >= 0) body = body.slice(0, openQuote);

    let previous = '';
    while (previous !== body) {
      previous = body;
      body = body
        .replace(/[\s,]+$/, '')          // trailing comma or space
        .replace(/"[^"]*"\s*:\s*$/, '')  // a key with no value
        .replace(/"[^"]*"$/, '')         // a key with no colon
        .replace(/:\s*$/, '')            // a colon with nothing after it
        .replace(/[\s,]+$/, '');
      // A property name we just removed may leave `{"a":1,` behind.
      body = body.replace(/,$/, '');
    }

    const open = openContainers(body);
    for (let n = open.length - 1; n >= 0; n -= 1) body += open[n];
    return { text: body, truncated: true };
  }

  let body = text.slice(0, safeAt + 1);
  for (let n = safeStack.length - 1; n >= 0; n -= 1) body += safeStack[n];
  return { text: body, truncated: true };
}

/** Where an unterminated string begins, or -1 when every string is closed. */
function lastOpenStringStart(text: string): number {
  let start = -1;
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; start = i; }
  }
  return inString ? start : -1;
}

/** The containers still open at the end of a fragment, outermost first. */
function openContainers(text: string): string[] {
  const stack: string[] = [];
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack[stack.length - 1] === ch) stack.pop();
  }
  return stack;
}

/** Parses a model reply, repairing a truncated document rather than failing. */
export function parseModelJson(raw: string): ModelJson {
  const isolated = isolate(raw);
  try {
    return { value: JSON.parse(isolated), repaired: false, truncated: false };
  } catch {
    /* fall through to the repair pass */
  }

  const fixed = repair(isolated);
  try {
    return { value: JSON.parse(fixed.text), repaired: true, truncated: fixed.truncated };
  } catch (err) {
    // One last try: some models emit trailing commas or single quotes.
    const relaxed = fixed.text
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
    try {
      return { value: JSON.parse(relaxed), repaired: true, truncated: fixed.truncated };
    } catch {
      throw new Error(
        `The model's JSON could not be read even after repair (${(err as Error).message}). `
        + 'This usually means the reply was cut off very early — try again, or use a model with a larger output limit.',
      );
    }
  }
}
