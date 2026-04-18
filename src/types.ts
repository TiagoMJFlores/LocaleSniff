export type Platform = 'ios' | 'android';
export type LocaleCode = string;

export interface AddedRange {
  startLine: number;
  endLine: number;
}

export interface ChangedFile {
  absPath: string;
  repoRelPath: string;
  platform: Platform;
  addedRanges: AddedRange[];
  addedContent: string;
}

export interface LocaleEntry {
  key: string;
  value: string;
  locale: LocaleCode;
  sourceFile: string;
  /**
   * 1-based line number in `sourceFile` where the entry's declaration starts.
   * Undefined for formats that don't have a meaningful line mapping (e.g.
   * .xcstrings JSON).
   */
  line?: number;
}

export interface LocaleIndex {
  platform: Platform;
  locales: LocaleCode[];
  baseLocale: LocaleCode;
  keys: Set<string>;
  entries: LocaleEntry[];
  /**
   * Quick lookup: key → locale → value. Built from entries at index-load time
   * so callers don't have to re-walk the array to answer "does this key exist
   * in locale X?" and "what's its value in Y?".
   */
  valuesByKey: Map<string, Map<LocaleCode, string>>;
}

export interface Finding {
  file: string;
  line: number;
  platform: Platform;
  stringLiteral: string;
  isUserFacing: boolean;
  rationale: string;
  suggestedKey: string;
  duplicateOfKey?: string;
  translations: Record<LocaleCode, string>;
}

export interface ScanStats {
  filesScanned: number;
  cacheHits: number;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  ms: number;
}

export interface LocaleFileTarget {
  sourceFile: string;
  lineCount: number;
}

export interface ScanResult {
  findings: Finding[];
  skipped: Array<{ file: string; reason: string }>;
  stats: ScanStats;
  /**
   * Per-platform map of locale code → the locale file where new keys would be
   * appended (if multiple exist per locale, the "largest" is picked — it's
   * the canonical one). Used by reporters to show concrete file + line.
   */
  localeTargets: Partial<Record<Platform, Record<LocaleCode, LocaleFileTarget>>>;
  /**
   * Per-platform map of locale file absolute path → its parsed entries.
   * Reporters use this with `findInsertionPoint` to pick a concrete line
   * where a new key should be added.
   */
  localeEntriesByFile: Partial<Record<Platform, Record<string, LocaleEntry[]>>>;
  /**
   * Per-platform LocaleIndex kept for lookup of existing keys (reuse match
   * resolution). Left out for platforms with no locale files.
   */
  localeIndexes: Partial<Record<Platform, LocaleIndex>>;
}

export type PlatformFilter = 'ios' | 'android' | 'both';
export type OutputFormat = 'text' | 'json';
export type FailOnMode = 'none' | 'any' | 'user-facing';

export interface RunConfig {
  repoRoot: string;
  since: string;
  window: string | undefined;
  full: boolean;
  platform: PlatformFilter;
  outputFormat: OutputFormat;
  cacheDir: string;
  failOn: FailOnMode;
  model: string;
  concurrency: number;
  dryRun: boolean;
  verbose: boolean;
  ignore: string[];
  anthropicApiKey: string | undefined;
}
