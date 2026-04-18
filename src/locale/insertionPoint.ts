import type { LocaleEntry } from '../types.js';

export interface InsertionPoint {
  /**
   * 1-based line number AFTER which the new entry should be inserted. If null,
   * caller should append at EOF.
   */
  afterLine: number | null;
  /**
   * Tokens of the shared prefix that won the match (e.g. ['consumable','selection']),
   * or null when falling back to EOF.
   */
  matchedPrefix: string[] | null;
  /**
   * The existing key that serves as the insertion anchor — i.e. "insert AFTER
   * this key". More stable across file edits than the line number, since line
   * numbers shift when someone else adds lines above.
   */
  anchorKey: string | null;
  /**
   * True when the file is a format with no meaningful line numbers (e.g.
   * .xcstrings JSON). Callers should render prose instead of a line number.
   */
  lineless: boolean;
}

/**
 * Find where to insert a new key in a locale file. Generic algorithm:
 *   1. Tokenize the new key and every existing key in the target file
 *      (split on . _ - / and camelCase, lowercase).
 *   2. Try the longest-common-prefix match: the longest leading token list
 *      shared between the new key and at least one existing key.
 *   3. Insert after the LAST existing entry that shares that prefix.
 *   4. If no existing key shares even the first token, return null → EOF fallback.
 *
 * Works for any naming convention (snake.dot, SCREAMING_SNAKE, camelCase,
 * slash/path, mixed) and any file organization (alphabetical, grouped,
 * chronological — doesn't matter, we anchor off content, not comments).
 */
export function findInsertionPoint(
  entriesInFile: LocaleEntry[],
  newKey: string,
): InsertionPoint {
  // entriesInFile should already be the subset for this exact source file.
  const hasLineNumbers = entriesInFile.every((e) => typeof e.line === 'number');
  const lineless = !hasLineNumbers && entriesInFile.length > 0;

  if (entriesInFile.length === 0) {
    return { afterLine: null, matchedPrefix: null, anchorKey: null, lineless };
  }

  const newTokens = tokenize(newKey);
  if (newTokens.length === 0) {
    return { afterLine: null, matchedPrefix: null, anchorKey: null, lineless };
  }

  const tokenized = entriesInFile.map((e) => ({
    entry: e,
    tokens: tokenize(e.key),
  }));

  // Longest-common-prefix match: try progressively shorter prefixes.
  for (let len = newTokens.length; len >= 1; len--) {
    const prefix = newTokens.slice(0, len);
    const matches = tokenized.filter((t) => startsWithTokens(t.tokens, prefix));
    if (matches.length === 0) continue;

    // Pick the last occurrence: by line number when available, else by the
    // last entry in input order (stable for lineless files).
    let best = matches[0]!;
    for (const m of matches) {
      if (typeof m.entry.line === 'number' && typeof best.entry.line === 'number') {
        if (m.entry.line > best.entry.line) best = m;
      } else {
        // Lineless — later match in iteration order wins.
        best = m;
      }
    }

    return {
      afterLine: typeof best.entry.line === 'number' ? best.entry.line : null,
      matchedPrefix: prefix,
      anchorKey: best.entry.key,
      lineless,
    };
  }

  return { afterLine: null, matchedPrefix: null, anchorKey: null, lineless };
}

function tokenize(key: string): string[] {
  if (!key) return [];
  const out: string[] = [];
  // Split on common separators first.
  const parts = key.split(/[._\-/\s]+/).filter(Boolean);
  for (const p of parts) {
    // Split camelCase / PascalCase inside each part.
    const sub = p
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // XMLHttp → XML Http
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')      // loginTitle → login Title
      .split(/\s+/)
      .filter(Boolean);
    for (const s of sub) out.push(s.toLowerCase());
  }
  return out;
}

function startsWithTokens(tokens: string[], prefix: string[]): boolean {
  if (tokens.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (tokens[i] !== prefix[i]) return false;
  }
  return true;
}

// Exported for tests.
export const __test = { tokenize, startsWithTokens };
