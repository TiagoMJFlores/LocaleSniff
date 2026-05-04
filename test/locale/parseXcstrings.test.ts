import { describe, expect, it } from 'vitest';
import { parseXcstringsText } from '../../src/locale/parseXcstrings.js';

describe('parseXcstringsText', () => {
  it('extracts per-locale values', () => {
    const json = JSON.stringify({
      sourceLanguage: 'en',
      strings: {
        'login.title': {
          localizations: {
            en: { stringUnit: { value: 'Sign in' } },
            pt: { stringUnit: { value: 'Iniciar sessão' } },
          },
        },
        'login.button': {
          localizations: {
            en: { stringUnit: { value: 'Submit' } },
          },
        },
      },
    });
    const result = parseXcstringsText(json, '/x.xcstrings');
    expect(result.sourceLanguage).toBe('en');
    expect(result.entries).toHaveLength(3);
    expect(result.entries.find((e) => e.key === 'login.title' && e.locale === 'pt')?.value).toBe(
      'Iniciar sessão',
    );
  });

  it('treats keys with no localizations as source-language entries', () => {
    const json = JSON.stringify({
      sourceLanguage: 'en',
      strings: { 'implicit.key': {} },
    });
    const result = parseXcstringsText(json, '/x.xcstrings');
    expect(result.entries).toEqual([
      { key: 'implicit.key', value: 'implicit.key', locale: 'en', sourceFile: '/x.xcstrings' },
    ]);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseXcstringsText('{not json', '/x.xcstrings')).toThrow(/Invalid/);
  });
});
