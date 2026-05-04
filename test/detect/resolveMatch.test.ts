import { describe, expect, it } from 'vitest';
import { resolveMatch } from '../../src/detect/resolveMatch.js';
import type { Finding, LocaleIndex } from '../../src/types.js';

function mkIndex(
  entries: Array<{ key: string; locale: string; value: string }>,
  locales: string[],
  baseLocale = 'en',
): LocaleIndex {
  const valuesByKey = new Map<string, Map<string, string>>();
  for (const e of entries) {
    let m = valuesByKey.get(e.key);
    if (!m) {
      m = new Map<string, string>();
      valuesByKey.set(e.key, m);
    }
    m.set(e.locale, e.value);
  }
  return {
    platform: 'ios',
    locales,
    baseLocale,
    keys: new Set(entries.map((e) => e.key)),
    entries: entries.map((e) => ({ key: e.key, locale: e.locale, value: e.value, sourceFile: '/x' })),
    valuesByKey,
  };
}

function mkFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    file: 'App/Home.swift',
    line: 42,
    platform: 'ios',
    stringLiteral: 'Welcome',
    isUserFacing: true,
    rationale: 'SwiftUI Text',
    suggestedKey: 'home.welcome',
    translations: { en: 'Welcome' },
    ...overrides,
  };
}

describe('resolveMatch', () => {
  it('returns new-only when LLM did not propose a duplicate', () => {
    const idx = mkIndex([{ key: 'other.key', locale: 'en', value: 'Other' }], ['en']);
    const r = resolveMatch(mkFinding(), idx);
    expect(r.kind).toBe('new-only');
    expect(r.optionA).toBeUndefined();
    expect(r.optionB.key).toBe('home.welcome');
  });

  it('returns new-only when LLM hallucinated a non-existent key', () => {
    const idx = mkIndex([{ key: 'real.key', locale: 'en', value: 'Real' }], ['en']);
    const r = resolveMatch(mkFinding({ duplicateOfKey: 'fake.key' }), idx);
    expect(r.kind).toBe('new-only');
  });

  it('returns reuse-only when all locales already have the key', () => {
    const idx = mkIndex(
      [
        { key: 'login.welcome', locale: 'en', value: 'Welcome' },
        { key: 'login.welcome', locale: 'pt', value: 'Bem-vindo' },
        { key: 'login.welcome', locale: 'es', value: 'Bienvenido' },
      ],
      ['en', 'pt', 'es'],
    );
    const r = resolveMatch(mkFinding({ duplicateOfKey: 'login.welcome' }), idx);
    expect(r.kind).toBe('reuse-only');
    expect(r.optionA?.presentInLocales).toEqual(['en', 'pt', 'es']);
    expect(r.optionA?.missingLocales).toEqual([]);
    expect(r.optionA?.valueDivergesFromDetected).toBe(false);
  });

  it('returns reuse-or-new when some locales are missing', () => {
    const idx = mkIndex(
      [
        { key: 'login.welcome', locale: 'en', value: 'Welcome' },
        { key: 'login.welcome', locale: 'pt', value: 'Bem-vindo' },
      ],
      ['en', 'pt', 'es', 'ca'],
    );
    const r = resolveMatch(mkFinding({ duplicateOfKey: 'login.welcome' }), idx);
    expect(r.kind).toBe('reuse-or-new');
    expect(r.optionA?.presentInLocales).toEqual(['en', 'pt']);
    expect(r.optionA?.missingLocales).toEqual(['es', 'ca']);
  });

  it('flags value divergence when base value differs from detected string', () => {
    const idx = mkIndex(
      [{ key: 'login.welcome', locale: 'en', value: 'Welcome back!' }],
      ['en'],
    );
    const r = resolveMatch(
      mkFinding({ duplicateOfKey: 'login.welcome', stringLiteral: 'Welcome' }),
      idx,
    );
    expect(r.kind).toBe('reuse-only'); // only one locale and it has the key
    expect(r.optionA?.valueDivergesFromDetected).toBe(true);
    expect(r.optionA?.baseValue).toBe('Welcome back!');
  });

  it('returns new-only when the key exists but not in base locale', () => {
    const idx = mkIndex(
      [{ key: 'login.welcome', locale: 'pt', value: 'Bem-vindo' }],
      ['en', 'pt'],
      'en',
    );
    const r = resolveMatch(mkFinding({ duplicateOfKey: 'login.welcome' }), idx);
    expect(r.kind).toBe('new-only');
  });

  it('always emits an optionB key regardless of reuse state', () => {
    const idx = mkIndex(
      [{ key: 'login.welcome', locale: 'en', value: 'Welcome' }],
      ['en'],
    );
    const r = resolveMatch(
      mkFinding({ duplicateOfKey: 'login.welcome', suggestedKey: 'home.welcome' }),
      idx,
    );
    expect(r.optionB.key).toBe('home.welcome');
  });
});
