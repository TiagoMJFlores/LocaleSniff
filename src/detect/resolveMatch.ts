import type { Finding, LocaleCode, LocaleIndex } from '../types.js';

export interface OptionA {
  /** Exact key that already exists in the base locale. */
  key: string;
  /** Value in the base locale (may differ from the detected string). */
  baseValue: string;
  /**
   * True when the base-locale value is different from the string the dev just
   * hardcoded. Callers should warn the dev to confirm the semantics match.
   */
  valueDivergesFromDetected: boolean;
  /** Locales (including base) where the key is already defined. */
  presentInLocales: LocaleCode[];
  /** Locales where this key is missing and would need to be added. */
  missingLocales: LocaleCode[];
}

export interface OptionB {
  /** Newly suggested key (the LLM's suggested_key). */
  key: string;
}

export interface ResolvedFinding {
  /**
   * 'reuse-only'  — Option A fully covers every locale; no new entries needed.
   * 'reuse-or-new' — Option A exists but is missing some locales; dev picks
   *                  between reusing (fill missing) or creating a new key.
   * 'new-only'    — no viable Option A; only Option B applies.
   */
  kind: 'reuse-only' | 'reuse-or-new' | 'new-only';
  optionA?: OptionA;
  optionB: OptionB;
}

/**
 * Validate the LLM's duplicate_of_key claim against the real index and
 * compute Option A / Option B state for a finding.
 *
 * The resolver is deterministic — the LLM proposes, this function decides.
 * If the LLM invented a key that doesn't exist, we silently downgrade to
 * 'new-only'.
 */
export function resolveMatch(
  finding: Finding,
  index: LocaleIndex,
): ResolvedFinding {
  const optionB: OptionB = { key: finding.suggestedKey };

  const claimed = finding.duplicateOfKey;
  if (!claimed) {
    return { kind: 'new-only', optionB };
  }

  const byLocale = index.valuesByKey.get(claimed);
  if (!byLocale || byLocale.size === 0) {
    // LLM hallucinated — silently ignore.
    return { kind: 'new-only', optionB };
  }

  // Must exist in at least the base locale to be a reasonable reuse candidate.
  const baseValue = byLocale.get(index.baseLocale);
  if (baseValue === undefined) {
    // The key exists somewhere but not in the base locale — edge case, skip reuse.
    return { kind: 'new-only', optionB };
  }

  const presentInLocales: LocaleCode[] = [];
  const missingLocales: LocaleCode[] = [];
  for (const loc of index.locales) {
    if (byLocale.has(loc)) presentInLocales.push(loc);
    else missingLocales.push(loc);
  }

  const optionA: OptionA = {
    key: claimed,
    baseValue,
    valueDivergesFromDetected: baseValue !== finding.stringLiteral,
    presentInLocales,
    missingLocales,
  };

  const kind = missingLocales.length === 0 ? 'reuse-only' : 'reuse-or-new';
  return { kind, optionA, optionB };
}
