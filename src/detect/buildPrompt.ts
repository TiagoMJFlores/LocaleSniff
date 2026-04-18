import type { ChangedFile, LocaleIndex } from '../types.js';
import type { ContextBlock } from './contextSelection.js';

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildSystemPrompt(): string {
  return [
    'You are LocaleSniff, a strict code reviewer focused on internationalization.',
    '',
    'Your task: given a diff of added lines from a mobile source file (iOS Swift/Obj-C or Android Kotlin/Java/XML), identify every hardcoded string literal that is shown to end users ("user-facing") and every one that is NOT (technical).',
    '',
    'Platform rules:',
    '  iOS: Strings passed to SwiftUI Text(...), Label(...), Button("..."), alert titles/messages, Toolbar labels, and other display APIs ARE user-facing. Strings already wrapped in NSLocalizedString(...), String(localized: ...), or LocalizedStringKey(...) are already externalized — DO NOT report them.',
    '  Android: Strings passed to Compose Text("..."), Button("...") content, TextView setters, Toolbar/Dialog builders ARE user-facing. Strings returned by getString(R.string.*), stringResource(R.string.*), or referenced via @string/* are already externalized — DO NOT report them.',
    '  Both: Strings used as URLs, HTTP headers, JSON keys, enum raw values, error identifiers, log messages, assertion text, accessibility IDs used programmatically, analytics event names, or BuildConfig constants are TECHNICAL, not user-facing. Report them only when asked; otherwise omit.',
    '',
    'Key naming rules:',
    '  - Lowercase snake.dot.case — matches the regex ^[a-z0-9_.]+$',
    '  - Start with a feature prefix inferred from the file path (e.g. Login.swift → login.*)',
    '  - Be concise (<= 4 dot-segments).',
    '  - If the existing_keys context contains a key whose meaning exactly matches, set duplicate_of_key to it AND still emit a suggested_key for downstream reference.',
    '',
    'Translations:',
    '  - ALWAYS provide an actual translation for every locale listed in <locales>, including the base.',
    '  - NEVER return the source-language string verbatim for a different locale (that defeats the purpose of localization).',
    '  - Translate even for short, placeholder-looking, or ambiguous strings — pick the best-guess translation. If the input is clearly a placeholder or casing looks off (e.g. "consumable title"), normalise it to proper sentence case in every locale, then translate ("Consumable title" / "Título del consumible" / "Títol del consumible" / ...).',
    '  - If you are uncertain about domain-specific terminology (brand names, product-specific jargon), still provide a translation and flag the uncertainty in the rationale (e.g. "translations for \'X\' are best-guess; please review").',
    '  - Use established translations for common UI concepts (Cancel, Save, Next, Close) rather than literal word-by-word.',
    '',
    'Output: call the report_findings tool exactly once with all findings.',
  ].join('\n');
}

export function buildUserPrompt(
  file: ChangedFile,
  localeIndex: LocaleIndex,
  context: ContextBlock,
): string {
  const blocks: string[] = [];

  blocks.push(`<file path=${JSON.stringify(file.repoRelPath)} platform=${JSON.stringify(file.platform)} />`);

  blocks.push('<diff description="Added lines only, prefixed by post-image line number and a tab.">');
  blocks.push(file.addedContent);
  blocks.push('</diff>');

  blocks.push(`<locales base=${JSON.stringify(localeIndex.baseLocale)}>`);
  blocks.push(localeIndex.locales.join(', '));
  blocks.push('</locales>');

  blocks.push('<existing_keys description="Subset of already-externalized keys in base locale, one per line, for convention & dedup.">');
  blocks.push(context.text);
  blocks.push('</existing_keys>');

  blocks.push('Call report_findings with every string literal you detected.');

  return blocks.join('\n');
}

export function buildPrompt(
  file: ChangedFile,
  localeIndex: LocaleIndex,
  context: ContextBlock,
): BuiltPrompt {
  return {
    system: buildSystemPrompt(),
    user: buildUserPrompt(file, localeIndex, context),
  };
}
