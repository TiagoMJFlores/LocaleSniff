import { describe, expect, it } from 'vitest';
import { findInsertionPoint, __test } from '../../src/locale/insertionPoint.js';
import type { LocaleEntry } from '../../src/types.js';

const { tokenize } = __test;

function mk(key: string, line: number | undefined): LocaleEntry {
  const e: LocaleEntry = { key, value: key, locale: 'en', sourceFile: '/f' };
  if (line !== undefined) e.line = line;
  return e;
}

describe('tokenize', () => {
  it('splits snake.dot.case', () => {
    expect(tokenize('consumable.selection.title')).toEqual(['consumable', 'selection', 'title']);
  });
  it('splits SCREAMING_SNAKE', () => {
    expect(tokenize('LOGIN_BUTTON_TITLE')).toEqual(['login', 'button', 'title']);
  });
  it('splits camelCase', () => {
    expect(tokenize('consumableSelectionTitle')).toEqual(['consumable', 'selection', 'title']);
  });
  it('splits PascalCase', () => {
    expect(tokenize('ConsumableSelectionTitle')).toEqual(['consumable', 'selection', 'title']);
  });
  it('handles mixed separators', () => {
    expect(tokenize('consumable-selection_Title')).toEqual(['consumable', 'selection', 'title']);
  });
  it('handles acronyms', () => {
    expect(tokenize('XMLHttpRequest')).toEqual(['xml', 'http', 'request']);
  });
});

describe('findInsertionPoint', () => {
  it('returns EOF fallback when file is empty', () => {
    const r = findInsertionPoint([], 'login.title');
    expect(r.afterLine).toBeNull();
    expect(r.matchedPrefix).toBeNull();
  });

  it('returns EOF fallback when no prefix matches', () => {
    const entries = [
      mk('home.title', 10),
      mk('profile.name', 20),
    ];
    const r = findInsertionPoint(entries, 'settings.privacy');
    expect(r.afterLine).toBeNull();
    expect(r.matchedPrefix).toBeNull();
  });

  it('picks longest-common-prefix match, last occurrence', () => {
    const entries = [
      mk('consumable.usage.title', 5),
      mk('consumable.usage.subtitle', 6),
      mk('consumable.selection.title', 10),
      mk('consumable.selection.subtitle', 11),
      mk('home.welcome', 20),
    ];
    const r = findInsertionPoint(entries, 'consumable.selection.description');
    expect(r.matchedPrefix).toEqual(['consumable', 'selection']);
    expect(r.afterLine).toBe(11);
  });

  it('falls back to shorter prefix when longer does not exist', () => {
    const entries = [
      mk('consumable.usage.title', 5),
      mk('consumable.usage.subtitle', 6),
      mk('home.welcome', 20),
    ];
    const r = findInsertionPoint(entries, 'consumable.selection.title');
    expect(r.matchedPrefix).toEqual(['consumable']);
    expect(r.afterLine).toBe(6);
  });

  it('works with SCREAMING_SNAKE convention', () => {
    const entries = [
      mk('HOME_TITLE', 3),
      mk('HOME_SUBTITLE', 4),
      mk('PROFILE_NAME', 10),
    ];
    const r = findInsertionPoint(entries, 'HOME_BADGE');
    expect(r.matchedPrefix).toEqual(['home']);
    expect(r.afterLine).toBe(4);
  });

  it('works with camelCase convention', () => {
    const entries = [
      mk('loginTitle', 3),
      mk('loginButton', 4),
      mk('homeWelcome', 10),
    ];
    const r = findInsertionPoint(entries, 'loginBadge');
    expect(r.matchedPrefix).toEqual(['login']);
    expect(r.afterLine).toBe(4);
  });

  it('treats different conventions as equivalent when tokens match', () => {
    const entries = [
      mk('consumable_selection_title', 10),
      mk('consumable_selection_subtitle', 11),
    ];
    const r = findInsertionPoint(entries, 'consumable.selection.description');
    expect(r.matchedPrefix).toEqual(['consumable', 'selection']);
    expect(r.afterLine).toBe(11);
  });

  it('marks lineless when entries lack line numbers', () => {
    const entries = [
      mk('login.title', undefined),
      mk('login.button', undefined),
    ];
    const r = findInsertionPoint(entries, 'login.badge');
    expect(r.lineless).toBe(true);
    expect(r.matchedPrefix).toEqual(['login']);
    expect(r.afterLine).toBeNull();
    expect(r.anchorKey).toBe('login.button');
  });

  it('returns the anchor key used for insertion', () => {
    const entries = [
      mk('login.title', 10),
      mk('login.button', 11),
      mk('home.welcome', 20),
    ];
    const r = findInsertionPoint(entries, 'login.badge');
    expect(r.anchorKey).toBe('login.button');
    expect(r.afterLine).toBe(11);
  });

  it('returns null anchorKey when falling back to EOF', () => {
    const entries = [mk('home.title', 5)];
    const r = findInsertionPoint(entries, 'settings.privacy');
    expect(r.anchorKey).toBeNull();
    expect(r.afterLine).toBeNull();
  });
});
