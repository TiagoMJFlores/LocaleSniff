import { promises as fs } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { LocaleCode, LocaleEntry } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  trimValues: false,
  preserveOrder: false,
});

export async function parseAndroidStringsXml(absPath: string): Promise<LocaleEntry[]> {
  const raw = await fs.readFile(absPath, 'utf8');
  return parseAndroidStringsXmlText(raw, absPath);
}

export function parseAndroidStringsXmlText(raw: string, sourceFile: string): LocaleEntry[] {
  let xml: unknown;
  try {
    xml = parser.parse(raw);
  } catch (err) {
    throw new Error(`Invalid Android XML at ${sourceFile}: ${(err as Error).message}`);
  }
  const locale = localeFromAndroidXmlPath(sourceFile);
  const entries: LocaleEntry[] = [];
  const resources = (xml as { resources?: unknown })?.resources;
  if (!resources || typeof resources !== 'object') return entries;

  const rawStrings = (resources as { string?: unknown }).string;
  const list = Array.isArray(rawStrings) ? rawStrings : rawStrings ? [rawStrings] : [];

  const linesByName = buildLineIndex(raw);

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj['@_name'] === 'string' ? (obj['@_name'] as string) : undefined;
    const translatable = obj['@_translatable'];
    if (translatable === 'false' || translatable === false) continue;
    if (!name) continue;
    const text = typeof obj['#text'] === 'string'
      ? (obj['#text'] as string)
      : typeof obj === 'string'
        ? (obj as unknown as string)
        : extractTextFallback(obj);
    if (typeof text !== 'string') continue;
    const entry: LocaleEntry = {
      key: name,
      value: unescapeAndroidString(text),
      locale,
      sourceFile,
    };
    const ln = linesByName.get(name);
    if (ln !== undefined) entry.line = ln;
    entries.push(entry);
  }
  return entries;
}

/**
 * Build key → line number by scanning the raw XML for `<string name="KEY"`.
 * This is independent of the parser and robust to attribute ordering.
 */
function buildLineIndex(raw: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/<string\b[^>]*\bname\s*=\s*"([^"]+)"/);
    if (m) {
      if (!map.has(m[1]!)) map.set(m[1]!, i + 1);
    }
  }
  return map;
}

function extractTextFallback(obj: Record<string, unknown>): string | undefined {
  // fast-xml-parser sometimes stores a pure text-only string directly.
  if (typeof obj['#text'] === 'number') return String(obj['#text']);
  return undefined;
}

function unescapeAndroidString(s: string): string {
  // Strip surrounding `"..."` if present (Android uses these to preserve whitespace).
  let v = s;
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case "'": return "'";
      case '"': return '"';
      case '\\': return '\\';
      default: return c;
    }
  });
}

export function localeFromAndroidXmlPath(absPath: string): LocaleCode {
  const parts = absPath.split(path.sep);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (p === 'values') return 'en'; // base locale convention
    const m = p.match(/^values-(.+)$/);
    if (m) {
      // `values-pt-rBR` → `pt-BR`; `values-fr` → `fr`; `values-zh-rCN` → `zh-CN`
      return m[1]!.replace(/-r([A-Z]{2})$/, '-$1');
    }
  }
  return 'unknown';
}
