/**
 * A small whitelist sanitiser for the HTML that comes out of a parsed paper.
 *
 * The model, and the Word file before it, decide what these strings contain, so
 * they are not trusted: everything not on the list below is dropped, attributes
 * included. Underlining survives because in these papers the underlined word is
 * usually the one being tested — it is content, not decoration.
 */

/** Inline formatting allowed inside a question, an option or a rubric. */
const INLINE = new Set(['u', 'b', 'strong', 'i', 'em', 'sup', 'sub', 's', 'br', 'span']);

/** Block structure additionally allowed in a passage or a gap-fill block. */
const BLOCK = new Set([
  'p', 'div', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'caption', 'col', 'colgroup',
]);

/** The few attributes worth keeping: paragraph refs and table spans. */
const ATTRS: Record<string, Set<string>> = {
  p: new Set(['data-ref']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  col: new Set(['span']),
};

function attributesOf(tag: string, raw: string): string {
  const allowed = ATTRS[tag];
  if (!allowed) return '';
  const out: string[] = [];
  for (const m of raw.matchAll(/([a-zA-Z-]+)\s*=\s*("([^"]*)"?|'([^']*)'?|([^\s"'>]+))/g)) {
    const name = m[1].toLowerCase();
    // Nothing that can run: no event handlers, no style, no src or href.
    if (!allowed.has(name) || name.startsWith('on')) continue;
    const value = (m[3] ?? m[4] ?? m[5] ?? '').replace(/[<>"'`]/g, '').slice(0, 60);
    if (!value) continue;
    out.push(`${name}="${value}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * Rewrites every `<...>` token in the string, keeping only whitelisted tags.
 *
 * The scan is deliberately not a regex over well-formed tags: an unbalanced
 * quote — `<img src=x onerror=alert(1) alt='>` — makes a tag that a "proper"
 * pattern fails to match but a browser still parses, and anything a pattern
 * fails to match is anything it fails to remove. So the string is walked
 * instead: at every `<`, everything up to the next `>` is one token, whatever
 * quoting it contains, and a token that is not an allowed tag disappears.
 */
function clean(html: string, tags: Set<string>): string {
  const input = String(html ?? '');
  let out = '';
  let i = 0;

  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt === -1) { out += input.slice(i); break; }
    out += input.slice(i, lt);

    const gt = input.indexOf('>', lt + 1);
    // A `<` with no `>` after it can never be a tag: show it as text.
    if (gt === -1) { out += '&lt;' + input.slice(lt + 1); break; }

    const token = input.slice(lt + 1, gt);
    i = gt + 1;

    // Comments, CDATA, doctypes and processing instructions go entirely.
    if (token.startsWith('!') || token.startsWith('?')) {
      if (token.startsWith('!--') && !token.endsWith('--')) {
        // An unterminated comment: drop the rest of the string with it.
        const close = input.indexOf('-->', gt);
        i = close === -1 ? input.length : close + 3;
      }
      continue;
    }

    const closing = token.startsWith('/');
    const name = (closing ? token.slice(1) : token).match(/^[a-zA-Z][a-zA-Z0-9]*/)?.[0]?.toLowerCase();
    if (!name) { out += '&lt;'; i = lt + 1; continue; }

    if (!tags.has(name)) {
      // The element itself is not allowed. For the few that carry executable
      // or embedded content, swallow what is inside them too.
      if (!closing && DROP_CONTENT.has(name)) {
        const end = new RegExp(`</\\s*${name}\\s*>`, 'i').exec(input.slice(i));
        i = end ? i + end.index + end[0].length : input.length;
      }
      continue;
    }

    if (closing) { out += `</${name}>`; continue; }
    const rest = token.slice(name.length);
    const selfClosing = name === 'br' || name === 'hr' || name === 'col';
    out += `<${name}${attributesOf(name, rest)}${selfClosing ? ' /' : ''}>`;
  }

  return out;
}

/** Tags whose contents must go with them. */
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'title']);

/** For a question stem, an option, a rubric: inline formatting only. */
export function sanitizeInline(html: string): string {
  return clean(html, INLINE);
}

/** For a passage or a gap-fill block: structure as well as formatting. */
export function sanitizeBlock(html: string): string {
  return clean(html, new Set([...INLINE, ...BLOCK]));
}

/** True when the string carries formatting worth rendering as HTML. */
export function hasMarkup(text: string | undefined): boolean {
  return !!text && /<(u|b|strong|i|em|sup|sub|s|br|span|p|div|table|ul|ol|li)\b/i.test(text);
}
