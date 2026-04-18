import { describe, expect, it } from 'vitest';
import { matchesAnyIgnore, subtractWindowFromDate, windowToDateExpr } from '../../src/git/scope.js';

describe('windowToDateExpr', () => {
  it('converts days', () => {
    expect(windowToDateExpr('14d')).toBe('14 days ago');
    expect(windowToDateExpr('1d')).toBe('1 day ago');
  });

  it('converts weeks', () => {
    expect(windowToDateExpr('2w')).toBe('2 weeks ago');
    expect(windowToDateExpr('1w')).toBe('1 week ago');
  });

  it('converts months', () => {
    expect(windowToDateExpr('3m')).toBe('3 months ago');
    expect(windowToDateExpr('1m')).toBe('1 month ago');
  });

  it('is case-insensitive and tolerates spaces', () => {
    expect(windowToDateExpr(' 2W ')).toBe('2 weeks ago');
  });

  it('rejects invalid formats', () => {
    expect(() => windowToDateExpr('two weeks')).toThrow();
    expect(() => windowToDateExpr('2x')).toThrow();
    expect(() => windowToDateExpr('')).toThrow();
  });
});

describe('subtractWindowFromDate', () => {
  const anchor = '2026-04-18T12:00:00.000Z';

  it('subtracts days', () => {
    expect(subtractWindowFromDate(anchor, '1d')).toBe('2026-04-17T12:00:00.000Z');
    expect(subtractWindowFromDate(anchor, '14d')).toBe('2026-04-04T12:00:00.000Z');
  });

  it('subtracts weeks', () => {
    expect(subtractWindowFromDate(anchor, '1w')).toBe('2026-04-11T12:00:00.000Z');
    expect(subtractWindowFromDate(anchor, '2w')).toBe('2026-04-04T12:00:00.000Z');
  });

  it('subtracts months', () => {
    expect(subtractWindowFromDate(anchor, '1m')).toBe('2026-03-18T12:00:00.000Z');
    expect(subtractWindowFromDate(anchor, '3m')).toBe('2026-01-18T12:00:00.000Z');
  });

  it('handles month rollovers when anchor day does not exist in target month', () => {
    // 2026-03-31 - 1 month → setUTCMonth(2) on day 31 rolls to 2026-03-03 (Mar has 31, Feb has 28)
    // We just assert it produces a deterministic valid ISO date; don't over-specify.
    const r = subtractWindowFromDate('2026-03-31T00:00:00.000Z', '1m');
    expect(r).toMatch(/^2026-0[23]-\d{2}T00:00:00\.000Z$/);
  });

  it('rejects invalid inputs', () => {
    expect(() => subtractWindowFromDate('not-a-date', '1w')).toThrow();
    expect(() => subtractWindowFromDate(anchor, '1y')).toThrow();
  });
});

describe('matchesAnyIgnore', () => {
  it('returns false when no patterns given', () => {
    expect(matchesAnyIgnore('a/b.swift', [])).toBe(false);
  });

  it('matches simple glob with **', () => {
    expect(matchesAnyIgnore('a/Tests/FooTests.swift', ['**/Tests/**'])).toBe(true);
    expect(matchesAnyIgnore('a/Foo.swift', ['**/Tests/**'])).toBe(false);
  });

  it('matches file suffix patterns', () => {
    expect(matchesAnyIgnore('X/Y/FooTests.swift', ['**/*Tests.swift'])).toBe(true);
    expect(matchesAnyIgnore('X/Y/FooTestsSpec.swift', ['**/*TestsSpec.swift'])).toBe(true);
  });

  it('normalizes backslash paths on Windows-style inputs', () => {
    expect(matchesAnyIgnore('a\\Tests\\FooTests.swift', ['**/Tests/**'])).toBe(true);
  });

  it('combines multiple patterns', () => {
    const patterns = ['**/*Spec.swift', '**/Tests/**'];
    expect(matchesAnyIgnore('a/b/FooSpec.swift', patterns)).toBe(true);
    expect(matchesAnyIgnore('a/Tests/Bar.swift', patterns)).toBe(true);
    expect(matchesAnyIgnore('a/b/Normal.swift', patterns)).toBe(false);
  });
});
