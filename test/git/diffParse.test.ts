import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../../src/git/diffParse.js';

describe('parseUnifiedDiff', () => {
  it('extracts added lines with post-image line numbers from --unified=0 diff', () => {
    const diff = [
      'diff --git a/App/Login.swift b/App/Login.swift',
      'index 1111111..2222222 100644',
      '--- a/App/Login.swift',
      '+++ b/App/Login.swift',
      '@@ -10,0 +11,2 @@',
      '+Text("Welcome back!")',
      '+Button("Sign in")',
      '@@ -20,1 +22,1 @@',
      '-old line',
      '+new line',
      '',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    expect(result).toHaveLength(1);
    const f = result[0]!;
    expect(f.repoRelPath).toBe('App/Login.swift');
    expect(f.addedRanges).toEqual([
      { startLine: 11, endLine: 12 },
      { startLine: 22, endLine: 22 },
    ]);
    expect(f.addedContent.split('\n')).toEqual([
      '11\tText("Welcome back!")',
      '12\tButton("Sign in")',
      '22\tnew line',
    ]);
    expect(f.isBinary).toBe(false);
    expect(f.isNewFile).toBe(false);
  });

  it('handles multiple files in one diff', () => {
    const diff = [
      'diff --git a/a.kt b/a.kt',
      '--- a/a.kt',
      '+++ b/a.kt',
      '@@ -0,0 +1,1 @@',
      '+val greeting = "Hi"',
      'diff --git a/b.swift b/b.swift',
      '--- a/b.swift',
      '+++ b/b.swift',
      '@@ -0,0 +5,1 @@',
      '+Text("Hello")',
      '',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    expect(result.map((f) => f.repoRelPath)).toEqual(['a.kt', 'b.swift']);
    expect(result[0]!.addedRanges).toEqual([{ startLine: 1, endLine: 1 }]);
    expect(result[1]!.addedRanges).toEqual([{ startLine: 5, endLine: 5 }]);
  });

  it('detects new files', () => {
    const diff = [
      'diff --git a/New.swift b/New.swift',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/New.swift',
      '@@ -0,0 +1,1 @@',
      '+import Foundation',
      '',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    expect(result[0]!.isNewFile).toBe(true);
    expect(result[0]!.repoRelPath).toBe('New.swift');
  });

  it('skips binary files', () => {
    const diff = [
      'diff --git a/logo.png b/logo.png',
      'Binary files a/logo.png and b/logo.png differ',
      '',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    expect(result[0]!.isBinary).toBe(true);
    expect(result[0]!.addedRanges).toEqual([]);
  });

  it('returns empty array for empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });

  it('handles default hunk count of 1', () => {
    // `@@ -X +Y @@` (no count) means "1 line"
    const diff = [
      'diff --git a/f.kt b/f.kt',
      '--- a/f.kt',
      '+++ b/f.kt',
      '@@ -3 +3 @@',
      '-old',
      '+new',
      '',
    ].join('\n');

    const result = parseUnifiedDiff(diff);
    expect(result[0]!.addedRanges).toEqual([{ startLine: 3, endLine: 3 }]);
    expect(result[0]!.addedContent).toBe('3\tnew');
  });
});
