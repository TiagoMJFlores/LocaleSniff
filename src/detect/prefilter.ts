import type { Platform } from '../types.js';

/**
 * Zero-cost pre-filter applied before any LLM call. Returns a reason string if
 * the file can be safely skipped; null otherwise.
 *
 * Invariant: if this returns non-null, there is PROVABLY no hardcoded
 * user-facing string in the added lines. False negatives (skipping something
 * that should have been checked) MUST be impossible. False positives (not
 * skipping something that would have been empty) are fine — they just cost
 * an LLM call.
 */
export function shouldSkipFile(addedContent: string, platform: Platform): string | null {
  // Strip comments cheaply so that strings inside them don't force an LLM call.
  const stripped = stripComments(addedContent, platform);

  if (!hasAnyStringLiteral(stripped, platform)) {
    return 'no string literals in added lines';
  }
  return null;
}

function stripComments(text: string, platform: Platform): string {
  // Remove line comments (//...) — applies to swift/kotlin/java/objc.
  // Remove block comments (/* ... */). For XML, strip <!-- ... -->.
  let out = text;
  if (platform === 'ios' || platform === 'android') {
    // The added content is line-prefixed ("N\tcontent"); we only need to be
    // cheap here, not perfect. Strip // comments per line after the tab.
    out = out
      .split('\n')
      .map((line) => {
        const tabIdx = line.indexOf('\t');
        if (tabIdx < 0) return line;
        const prefix = line.slice(0, tabIdx + 1);
        const body = line.slice(tabIdx + 1);
        const slashSlash = findUnquotedSlashSlash(body);
        if (slashSlash >= 0) return prefix + body.slice(0, slashSlash);
        return line;
      })
      .join('\n');
    out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  }
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  return out;
}

function findUnquotedSlashSlash(line: string): number {
  let inStr: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return i;
  }
  return -1;
}

function hasAnyStringLiteral(text: string, platform: Platform): boolean {
  if (platform === 'android') {
    // Android resource XML: look for `<string ... >TEXT</string>` with non-empty text,
    // or any Kotlin/Java `"..."` literal.
    if (/<string\b[^>]*>\s*\S+/i.test(text)) return true;
    if (hasQuotedLiteral(text)) return true;
    if (/"""[\s\S]*?"""/.test(text)) return true; // Kotlin raw strings
    return false;
  }
  // iOS (Swift, Obj-C, Obj-C++)
  if (hasQuotedLiteral(text)) return true;
  // Swift multi-line `"""..."""`
  if (/"""[\s\S]*?"""/.test(text)) return true;
  // Obj-C `@"..."` — already caught by hasQuotedLiteral
  return false;
}

function hasQuotedLiteral(text: string): boolean {
  // Any non-empty `"..."` (with or without content); must contain at least one
  // character (so `""` alone doesn't count as a candidate user-facing string).
  // This is a coarse check — an empty string is still a literal but would be
  // flagged by a proper scanner; we skip it here because it can't be a
  // user-facing message.
  const re = /"[^"\\]*(?:\\.[^"\\]*)*"/;
  return re.test(text) && !isOnlyEmptyStrings(text);
}

function isOnlyEmptyStrings(text: string): boolean {
  // True only when every quoted literal is empty (i.e. `""`). Rare.
  const all = text.match(/"[^"\\]*(?:\\.[^"\\]*)*"/g) ?? [];
  if (all.length === 0) return true;
  return all.every((s) => s === '""');
}
