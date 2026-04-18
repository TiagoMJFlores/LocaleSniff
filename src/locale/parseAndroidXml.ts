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

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj['@_name'] === 'string' ? (obj['@_name'] as string) : undefined;
    const translatable = obj['@_translatable'];
    if (translatable === 'false' || translatable === false) continue;
    if (!name) continue;
    // fast-xml-parser may set the value directly (string) or under '#text' when
    // attributes are present. Treat everything else as the value too.
    const text = typeof obj['#text'] === 'string'
      ? (obj['#text'] as string)
      : typeof obj === 'string'
        ? (obj as unknown as string)
        : // When an element has only text, the whole obj may be the string — but
          // attributes force it into an object shape; handle numeric/other.
          extractTextFallback(obj);
    if (typeof text !== 'string') continue;
    entries.push({
      key: name,
      value: unescapeAndroidString(text),
      locale,
      sourceFile,
    });
  }
  return entries;
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
