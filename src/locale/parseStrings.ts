import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LocaleCode, LocaleEntry } from '../types.js';

/**
 * Parse an Apple `.strings` file. Format: `"key" = "value";` with `//` and
 * `/* ... *\/` comments. Supports UTF-16 LE/BE with BOM (common in older iOS
 * projects) and UTF-8.
 *
 * The locale is derived from the enclosing `.lproj` folder name
 * (`en.lproj` → `en`, `pt-BR.lproj` → `pt-BR`, `Base.lproj` → `Base`).
 */
export async function parseStringsFile(absPath: string): Promise<LocaleEntry[]> {
  const buf = await fs.readFile(absPath);
  const text = decodeBuffer(buf);
  const locale = localeFromStringsPath(absPath);
  return parseStringsText(text, locale, absPath);
}

export function parseStringsText(text: string, locale: LocaleCode, sourceFile: string): LocaleEntry[] {
  // Strip block comments
  const noBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const entries: LocaleEntry[] = [];
  // Match: "key" = "value";  with escape handling for \" inside either string.
  const re = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
  const lines = noBlockComments.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      entries.push({
        key: unescape(m[1]!),
        value: unescape(m[2]!),
        locale,
        sourceFile,
      });
    }
    re.lastIndex = 0;
  }
  return entries;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      default: return c;
    }
  });
}

function decodeBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16 BE: swap bytes, decode as LE
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]!;
      swapped[i - 1] = buf[i]!;
    }
    return swapped.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8', 3);
  }
  return buf.toString('utf8');
}

export function localeFromStringsPath(absPath: string): LocaleCode {
  const parts = absPath.split(path.sep);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (p.endsWith('.lproj')) {
      return p.slice(0, -'.lproj'.length);
    }
  }
  return 'unknown';
}
