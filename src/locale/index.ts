import type { LocaleCode, LocaleEntry, LocaleIndex, Platform } from '../types.js';
import type { Logger } from '../logger.js';
import { discoverLocaleFiles, filterForPlatform } from './discover.js';
import { parseStringsFile } from './parseStrings.js';
import { parseXcstringsFile } from './parseXcstrings.js';
import { parseAndroidStringsXml } from './parseAndroidXml.js';

/**
 * Load a unified LocaleIndex for a given platform. Returns null when the
 * platform has no locale files in the repo (caller may skip that platform).
 */
export async function loadLocaleIndex(
  repoRoot: string,
  platform: Platform,
  logger: Logger,
): Promise<LocaleIndex | null> {
  const all = await discoverLocaleFiles(repoRoot);
  const files = filterForPlatform(all, platform);

  const entries: LocaleEntry[] = [];
  let sourceLanguageFromXcstrings: LocaleCode | null = null;

  if (platform === 'ios') {
    for (const f of files.iosStrings) {
      try {
        const parsed = await parseStringsFile(f);
        entries.push(...parsed);
      } catch (err) {
        logger.warn(`failed to parse ${f}: ${(err as Error).message}`);
      }
    }
    for (const f of files.iosXcstrings) {
      try {
        const parsed = await parseXcstringsFile(f);
        entries.push(...parsed.entries);
        sourceLanguageFromXcstrings ??= parsed.sourceLanguage;
      } catch (err) {
        logger.warn(`failed to parse ${f}: ${(err as Error).message}`);
      }
    }
  } else {
    for (const f of files.androidStrings) {
      try {
        const parsed = await parseAndroidStringsXml(f);
        entries.push(...parsed);
      } catch (err) {
        logger.warn(`failed to parse ${f}: ${(err as Error).message}`);
      }
    }
  }

  if (entries.length === 0) return null;

  const localesSet = new Set<LocaleCode>();
  const keysSet = new Set<string>();
  for (const e of entries) {
    localesSet.add(e.locale);
    keysSet.add(e.key);
  }
  const locales = [...localesSet].sort();
  const baseLocale = pickBaseLocale(platform, locales, sourceLanguageFromXcstrings);

  return {
    platform,
    locales,
    baseLocale,
    keys: keysSet,
    entries,
  };
}

function pickBaseLocale(
  platform: Platform,
  locales: LocaleCode[],
  xcstringsSource: LocaleCode | null,
): LocaleCode {
  if (platform === 'ios') {
    if (xcstringsSource && locales.includes(xcstringsSource)) return xcstringsSource;
    if (locales.includes('Base')) return 'Base';
    if (locales.includes('en')) return 'en';
    return locales[0] ?? 'en';
  }
  // android
  if (locales.includes('en')) return 'en';
  return locales[0] ?? 'en';
}
