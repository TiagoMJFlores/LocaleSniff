import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { parseStringsText, localeFromStringsPath } from '../../src/locale/parseStrings.js';

describe('parseStringsText', () => {
  it('parses simple key = value lines', () => {
    const text = [
      '/* comment */',
      '"hello" = "Hello";',
      '"world" = "World";',
      '// line comment',
      '"with_space" = "Has spaces";',
    ].join('\n');

    const entries = parseStringsText(text, 'en', '/fake/en.lproj/Localizable.strings');
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ['hello', 'Hello'],
      ['world', 'World'],
      ['with_space', 'Has spaces'],
    ]);
    expect(entries[0]!.locale).toBe('en');
  });

  it('handles escaped quotes and newlines', () => {
    const text = `"k" = "a \\"quoted\\" word\\nline2";`;
    const [entry] = parseStringsText(text, 'pt', 'x.strings');
    expect(entry!.value).toBe('a "quoted" word\nline2');
  });

  it('ignores block comments spanning lines', () => {
    const text = [
      '/* this "key" = "value"; is a comment */',
      '"real" = "ok";',
    ].join('\n');
    const entries = parseStringsText(text, 'en', 'x.strings');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('real');
  });

  it('skips single-line comments starting with //', () => {
    const text = '// "fake" = "nope";\n"real" = "yes";';
    const entries = parseStringsText(text, 'en', 'x.strings');
    expect(entries.map((e) => e.key)).toEqual(['real']);
  });
});

describe('localeFromStringsPath', () => {
  it('extracts locale from .lproj folder', () => {
    expect(localeFromStringsPath(path.join('a', 'b', 'en.lproj', 'Localizable.strings'))).toBe('en');
    expect(localeFromStringsPath(path.join('a', 'pt-BR.lproj', 'Localizable.strings'))).toBe('pt-BR');
    expect(localeFromStringsPath(path.join('a', 'Base.lproj', 'Localizable.strings'))).toBe('Base');
  });

  it('returns unknown when no .lproj', () => {
    expect(localeFromStringsPath('/a/b/strings.txt')).toBe('unknown');
  });
});
