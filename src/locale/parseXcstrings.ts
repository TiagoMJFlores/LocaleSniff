import { promises as fs } from 'node:fs';
import type { LocaleCode, LocaleEntry } from '../types.js';

interface XcstringUnit {
  value?: string;
}
interface XcstringLocalization {
  stringUnit?: XcstringUnit;
}
interface XcstringKeyEntry {
  localizations?: Record<string, XcstringLocalization>;
}
interface XcstringsFile {
  sourceLanguage?: string;
  strings?: Record<string, XcstringKeyEntry>;
}

export interface XcstringsParseResult {
  sourceLanguage: LocaleCode;
  entries: LocaleEntry[];
}

export async function parseXcstringsFile(absPath: string): Promise<XcstringsParseResult> {
  const raw = await fs.readFile(absPath, 'utf8');
  return parseXcstringsText(raw, absPath);
}

export function parseXcstringsText(raw: string, sourceFile: string): XcstringsParseResult {
  let parsed: XcstringsFile;
  try {
    parsed = JSON.parse(raw) as XcstringsFile;
  } catch (err) {
    throw new Error(`Invalid .xcstrings JSON at ${sourceFile}: ${(err as Error).message}`);
  }
  const sourceLanguage = parsed.sourceLanguage ?? 'en';
  const entries: LocaleEntry[] = [];
  const strings = parsed.strings ?? {};

  for (const [key, keyEntry] of Object.entries(strings)) {
    const locs = keyEntry.localizations ?? {};
    for (const [locale, loc] of Object.entries(locs)) {
      const value = loc.stringUnit?.value;
      if (typeof value === 'string') {
        entries.push({ key, value, locale, sourceFile });
      }
    }
    // If there are no localizations at all, the key itself may act as the
    // source value (Xcode convention for auto-extracted strings).
    if (Object.keys(locs).length === 0) {
      entries.push({ key, value: key, locale: sourceLanguage, sourceFile });
    }
  }
  return { sourceLanguage, entries };
}
