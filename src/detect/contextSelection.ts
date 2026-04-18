import path from 'node:path';
import type { LocaleEntry, LocaleIndex } from '../types.js';
import { sha256 } from '../cache/key.js';

const DEFAULT_MAX_ENTRIES = 150;
const DEFAULT_MAX_CHARS = 8000;

export interface ContextBlock {
  /** The rendered text block to inject into the prompt. */
  text: string;
  /** sha256 of `text` — used in the cache key so cache invalidates on context change. */
  digest: string;
  /** Number of entries actually included. */
  included: number;
}

export interface ContextSelectionOptions {
  maxEntries?: number;
  maxChars?: number;
}

/**
 * Pick a deterministic, bounded subset of existing locale entries (base locale
 * only) to show the LLM. Ranking:
 *   1. Feature-path match (keys whose prefix matches a word in the file path)
 *   2. Token overlap between the base value and literals roughly extracted from
 *      the added content (heuristic — LLM still does the real decision)
 *   3. Recency fallback (stable ordering within the tie)
 *
 * We feed only base-locale entries to keep the context compact. The LLM uses
 * them to match conventions and detect duplicates.
 */
export function selectContext(
  index: LocaleIndex,
  filePath: string,
  addedContent: string,
  opts: ContextSelectionOptions = {},
): ContextBlock {
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;

  const baseEntries = index.entries.filter((e) => e.locale === index.baseLocale);
  if (baseEntries.length === 0) {
    return { text: '', digest: sha256(''), included: 0 };
  }

  const featureTokens = extractFeatureTokens(filePath);
  const diffTokens = extractDiffTokens(addedContent);

  const scored = baseEntries.map((entry) => ({
    entry,
    score: scoreEntry(entry, featureTokens, diffTokens),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // stable tiebreak by key for deterministic ordering
    return a.entry.key.localeCompare(b.entry.key);
  });

  const lines: string[] = [];
  let chars = 0;
  let included = 0;
  for (const { entry } of scored) {
    if (included >= maxEntries) break;
    const line = renderEntry(entry);
    if (chars + line.length + 1 > maxChars) break;
    lines.push(line);
    chars += line.length + 1;
    included += 1;
  }

  const text = lines.join('\n');
  return { text, digest: sha256(text), included };
}

function renderEntry(e: LocaleEntry): string {
  // Escape newlines inside the value to keep the block readable/one-line-per-entry.
  const v = e.value.replace(/\n/g, '\\n');
  return `${e.key} = ${JSON.stringify(v)}`;
}

function extractFeatureTokens(filePath: string): Set<string> {
  const segs = filePath
    .replace(/\.[^./\\]+$/, '')
    .split(/[\/\\]/)
    .filter(Boolean);
  const toks = new Set<string>();
  for (const s of segs) {
    // break CamelCase and snake_case, lowercase
    s.replace(/([A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+)/g, (m) => {
      if (m.length >= 3) toks.add(m.toLowerCase());
      return m;
    });
    for (const part of s.split(/[_\-]+/)) {
      if (part.length >= 3) toks.add(part.toLowerCase());
    }
  }
  return toks;
}

function extractDiffTokens(addedContent: string): Set<string> {
  // Cheap heuristic: pull out tokens from quoted strings in the diff.
  const toks = new Set<string>();
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(addedContent)) !== null) {
    const content = m[1]!;
    for (const w of content.split(/[^A-Za-z0-9]+/)) {
      if (w.length >= 3) toks.add(w.toLowerCase());
    }
  }
  return toks;
}

function scoreEntry(entry: LocaleEntry, featureTokens: Set<string>, diffTokens: Set<string>): number {
  let score = 0;
  const keyLower = entry.key.toLowerCase();
  const valueTokens = entry.value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  // Feature prefix match
  for (const ft of featureTokens) {
    if (keyLower.includes(ft)) {
      score += 10;
      break;
    }
  }

  // Value token overlap with diff
  for (const vt of valueTokens) {
    if (diffTokens.has(vt)) {
      score += 3;
    }
  }

  return score;
}

// Exported for tests/inspection.
export const __test = { extractFeatureTokens, extractDiffTokens, scoreEntry };
