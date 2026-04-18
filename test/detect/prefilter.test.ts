import { describe, expect, it } from 'vitest';
import { shouldSkipFile } from '../../src/detect/prefilter.js';

describe('shouldSkipFile (zero-cost pre-filter)', () => {
  describe('iOS', () => {
    it('skips when added lines have no string literals', () => {
      const diff = [
        '10\timport Foundation',
        '11\tstruct Payment {',
        '12\t  let amount: Decimal',
        '13\t  let currency: Currency',
        '14\t}',
      ].join('\n');
      expect(shouldSkipFile(diff, 'ios')).toBe('no string literals in added lines');
    });

    it('does NOT skip when a string literal is present', () => {
      const diff = '42\tText("Welcome")';
      expect(shouldSkipFile(diff, 'ios')).toBeNull();
    });

    it('skips when the only quoted content is inside a // comment', () => {
      const diff = '10\t// "example" here is just documentation';
      expect(shouldSkipFile(diff, 'ios')).toBe('no string literals in added lines');
    });

    it('skips when the only quoted content is inside a /* */ block', () => {
      const diff = '10\t/* example: "abc" */\n11\tstruct X {}';
      expect(shouldSkipFile(diff, 'ios')).toBe('no string literals in added lines');
    });

    it('detects Swift multi-line strings', () => {
      const diff = '10\tlet msg = """\n11\tLine 1\n12\t"""';
      expect(shouldSkipFile(diff, 'ios')).toBeNull();
    });

    it('detects Obj-C @"..." strings', () => {
      const diff = '10\tNSString *title = @"Hello";';
      expect(shouldSkipFile(diff, 'ios')).toBeNull();
    });

    it('skips when all literals are empty strings', () => {
      const diff = '10\tlet x = ""';
      expect(shouldSkipFile(diff, 'ios')).toBe('no string literals in added lines');
    });
  });

  describe('Android', () => {
    it('skips Kotlin file with no strings', () => {
      const diff = '10\tclass Foo { val x = 42 }';
      expect(shouldSkipFile(diff, 'android')).toBe('no string literals in added lines');
    });

    it('does NOT skip Kotlin file with string literal', () => {
      const diff = '10\tval title = "Welcome"';
      expect(shouldSkipFile(diff, 'android')).toBeNull();
    });

    it('detects <string> elements in XML', () => {
      const diff = '10\t<string name="hi">Hello</string>';
      expect(shouldSkipFile(diff, 'android')).toBeNull();
    });

    it('skips XML with only comments', () => {
      const diff = '10\t<!-- <string name="x">v</string> -->';
      expect(shouldSkipFile(diff, 'android')).toBe('no string literals in added lines');
    });

    it('detects Kotlin triple-quoted strings', () => {
      const diff = '10\tval s = """line"""';
      expect(shouldSkipFile(diff, 'android')).toBeNull();
    });
  });

  it('returns skip reason for empty input', () => {
    expect(shouldSkipFile('', 'ios')).toBe('no string literals in added lines');
  });
});
