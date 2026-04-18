import { describe, expect, it } from 'vitest';
import { selectContext } from '../../src/detect/contextSelection.js';
import type { LocaleIndex } from '../../src/types.js';

function makeIndex(entries: Array<[string, string]>): LocaleIndex {
  return {
    platform: 'ios',
    locales: ['en'],
    baseLocale: 'en',
    keys: new Set(entries.map(([k]) => k)),
    entries: entries.map(([key, value]) => ({ key, value, locale: 'en', sourceFile: 'x' })),
  };
}

describe('selectContext', () => {
  it('returns empty when index has no base entries', () => {
    const idx: LocaleIndex = {
      platform: 'ios',
      locales: ['pt'],
      baseLocale: 'en', // no 'en' entries exist
      keys: new Set(),
      entries: [{ key: 'k', value: 'v', locale: 'pt', sourceFile: 'x' }],
    };
    const ctx = selectContext(idx, 'a.swift', '');
    expect(ctx.included).toBe(0);
    expect(ctx.text).toBe('');
  });

  it('prioritizes keys matching file path tokens', () => {
    const idx = makeIndex([
      ['common.ok', 'OK'],
      ['login.title', 'Sign in'],
      ['profile.save', 'Save profile'],
    ]);
    const ctx = selectContext(idx, 'App/Login.swift', '');
    const firstLine = ctx.text.split('\n')[0]!;
    expect(firstLine).toContain('login.title');
  });

  it('rewards token overlap with diff content', () => {
    const idx = makeIndex([
      ['a.save', 'Save'],
      ['a.cancel', 'Cancel'],
      ['a.welcome', 'Welcome home'],
    ]);
    const diff = '42\tText("Welcome")';
    const ctx = selectContext(idx, 'Home.swift', diff);
    const firstLine = ctx.text.split('\n')[0]!;
    expect(firstLine).toContain('a.welcome');
  });

  it('respects maxEntries and maxChars', () => {
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < 500; i++) entries.push([`k.n${i}`, `Value ${i}`]);
    const idx = makeIndex(entries);
    const ctx = selectContext(idx, 'a.swift', '', { maxEntries: 10, maxChars: 10000 });
    expect(ctx.included).toBe(10);
    expect(ctx.text.split('\n')).toHaveLength(10);
  });

  it('is deterministic (same inputs → same digest)', () => {
    const idx = makeIndex([
      ['a.x', 'X'],
      ['b.y', 'Y'],
    ]);
    const a = selectContext(idx, 'f.swift', 'diff');
    const b = selectContext(idx, 'f.swift', 'diff');
    expect(a.digest).toBe(b.digest);
    expect(a.text).toBe(b.text);
  });
});
