import { describe, expect, it } from 'vitest';
import { renderText } from '../../src/report/text.js';
import type { Finding, LocaleIndex, RunConfig, ScanResult } from '../../src/types.js';

function baseCfg(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    repoRoot: '/r',
    since: 'origin/main',
    window: undefined,
    full: false,
    platform: 'both',
    outputFormat: 'text',
    cacheDir: '',
    failOn: 'none',
    model: 'x',
    concurrency: 1,
    dryRun: false,
    verbose: false,
    ignore: [],
    recommend: false,
    includeTechnical: false,
    anthropicApiKey: 'x',
    ...overrides,
  };
}

function mkResult(findings: Finding[], localeIndexes: ScanResult['localeIndexes'] = {}): ScanResult {
  return {
    findings,
    skipped: [],
    stats: { filesScanned: 1, cacheHits: 0, llmCalls: 1, tokensIn: 0, tokensOut: 0, ms: 0 },
    localeTargets: {},
    localeEntriesByFile: {},
    localeIndexes,
  };
}

const uf: Finding = {
  file: 'App/Home.swift',
  line: 10,
  platform: 'ios',
  stringLiteral: 'Welcome',
  isUserFacing: true,
  rationale: 'SwiftUI Text',
  suggestedKey: 'home.welcome',
  translations: { en: 'Welcome' },
};

const tech: Finding = {
  file: 'App/Api.swift',
  line: 5,
  platform: 'ios',
  stringLiteral: '/api/v1/users',
  isUserFacing: false,
  rationale: 'URL path',
  suggestedKey: '',
  translations: {},
};

describe('renderText gating', () => {
  it('only shows user-facing findings by default', () => {
    const out = renderText(mkResult([uf, tech]), baseCfg());
    expect(out).toContain('Findings (user-facing)');
    expect(out).toContain('"Welcome"');
    expect(out).not.toContain('/api/v1/users');
    expect(out).toContain('technical strings ignored');
  });

  it('includes technical findings when --include-technical', () => {
    const out = renderText(mkResult([uf, tech]), baseCfg({ includeTechnical: true }));
    expect(out).toContain('/api/v1/users');
    expect(out).toContain('classified as non-user-facing');
  });

  it('omits Recommendations section when --recommend is off', () => {
    const out = renderText(mkResult([uf]), baseCfg());
    expect(out).not.toContain('## Recommendations');
    expect(out).toContain('re-run with --recommend');
  });

  it('emits Recommendations section when --recommend is on', () => {
    const idx: LocaleIndex = {
      platform: 'ios',
      locales: ['en'],
      baseLocale: 'en',
      keys: new Set(),
      entries: [],
      valuesByKey: new Map(),
    };
    const out = renderText(mkResult([uf], { ios: idx }), baseCfg({ recommend: true }));
    expect(out).toContain('## Recommendations');
    expect(out).toContain('home.welcome');
  });

  it('does not nudge toward --recommend when there are no user-facing findings', () => {
    const out = renderText(mkResult([tech]), baseCfg());
    expect(out).not.toContain('re-run with --recommend');
  });
});
