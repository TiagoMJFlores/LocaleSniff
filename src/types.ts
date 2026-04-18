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
}

export interface LocaleIndex {
  platform: Platform;
  locales: LocaleCode[];
  baseLocale: LocaleCode;
  keys: Set<string>;
  entries: LocaleEntry[];
}

export interface Finding {
  file: string;
  line: number;
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

export interface ScanResult {
  findings: Finding[];
  skipped: Array<{ file: string; reason: string }>;
  stats: ScanStats;
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
