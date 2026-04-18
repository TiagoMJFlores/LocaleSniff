import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  localeFromAndroidXmlPath,
  parseAndroidStringsXmlText,
} from '../../src/locale/parseAndroidXml.js';

describe('parseAndroidStringsXmlText', () => {
  it('extracts simple strings', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="hello">Hello</string>
  <string name="bye">Goodbye</string>
</resources>`;
    const entries = parseAndroidStringsXmlText(xml, '/r/values/strings.xml');
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ['hello', 'Hello'],
      ['bye', 'Goodbye'],
    ]);
    expect(entries[0]!.locale).toBe('en');
  });

  it('unescapes sequences and handles quoted whitespace wrappers', () => {
    const xml = `<resources>
  <string name="q">"  spaced  "</string>
  <string name="nl">line1\\nline2</string>
  <string name="ap">it\\'s</string>
</resources>`;
    const entries = parseAndroidStringsXmlText(xml, '/r/values/strings.xml');
    const map = Object.fromEntries(entries.map((e) => [e.key, e.value]));
    expect(map['q']).toBe('  spaced  ');
    expect(map['nl']).toBe('line1\nline2');
    expect(map['ap']).toBe("it's");
  });

  it('skips translatable="false" strings', () => {
    const xml = `<resources>
  <string name="keep">Yes</string>
  <string name="skip" translatable="false">No</string>
</resources>`;
    const entries = parseAndroidStringsXmlText(xml, '/r/values/strings.xml');
    expect(entries.map((e) => e.key)).toEqual(['keep']);
  });
});

describe('localeFromAndroidXmlPath', () => {
  const p = (...parts: string[]) => parts.join(path.sep);

  it('returns en for values/ (base)', () => {
    expect(localeFromAndroidXmlPath(p('app', 'res', 'values', 'strings.xml'))).toBe('en');
  });

  it('parses simple locale codes', () => {
    expect(localeFromAndroidXmlPath(p('app', 'res', 'values-fr', 'strings.xml'))).toBe('fr');
    expect(localeFromAndroidXmlPath(p('app', 'res', 'values-pt', 'strings.xml'))).toBe('pt');
  });

  it('parses region qualifier', () => {
    expect(localeFromAndroidXmlPath(p('app', 'res', 'values-pt-rBR', 'strings.xml'))).toBe('pt-BR');
    expect(localeFromAndroidXmlPath(p('app', 'res', 'values-zh-rCN', 'strings.xml'))).toBe('zh-CN');
  });
});
