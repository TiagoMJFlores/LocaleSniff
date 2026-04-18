import path from 'node:path';
import type { Finding, LocaleEntry, LocaleFileTarget, Platform, ScanResult } from '../types.js';
import { findInsertionPoint } from '../locale/insertionPoint.js';
import { resolveMatch, type ResolvedFinding } from '../detect/resolveMatch.js';

export function renderText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push('LocaleSniff report');
  lines.push('==================');

  if (result.findings.length === 0) {
    lines.push('No findings.');
  } else {
    // Resolve each user-facing finding against the per-platform index.
    const resolvedByFinding = new Map<Finding, ResolvedFinding>();
    for (const f of result.findings) {
      if (!f.isUserFacing) continue;
      const idx = result.localeIndexes[f.platform];
      if (!idx) continue;
      resolvedByFinding.set(f, resolveMatch(f, idx));
    }

    const byFile = new Map<string, Finding[]>();
    for (const f of result.findings) {
      const arr = byFile.get(f.file) ?? [];
      arr.push(f);
      byFile.set(f.file, arr);
    }

    lines.push('');
    lines.push('## Source file changes');
    for (const [file, findings] of byFile) {
      lines.push('');
      lines.push(`  ${file}`);
      for (const f of findings) {
        const marker = f.isUserFacing ? 'USER-FACING' : 'technical';
        lines.push(`    line ${f.line}  [${marker}]  ${JSON.stringify(f.stringLiteral)}`);
        if (!f.isUserFacing) {
          if (f.rationale) lines.push(`      (${f.rationale})`);
          continue;
        }
        const resolved = resolvedByFinding.get(f);
        if (!resolved) {
          lines.push(`      → suggested key: ${f.suggestedKey}`);
          if (f.rationale) lines.push(`      (${f.rationale})`);
          continue;
        }
        renderSourceOptions(lines, resolved);
        if (f.rationale) lines.push(`      (${f.rationale})`);
      }
    }

    const localeChanges = renderLocaleChanges(result, resolvedByFinding);
    if (localeChanges.length > 0) {
      lines.push('');
      lines.push('## Locale file changes');
      for (const l of localeChanges) lines.push(l);
    }
  }

  if (result.skipped.length > 0) {
    lines.push('');
    lines.push('Skipped:');
    for (const s of result.skipped) {
      lines.push(`  ${s.file}: ${s.reason}`);
    }
  }

  const s = result.stats;
  lines.push('');
  lines.push(
    `Stats — files: ${s.filesScanned}, cache hits: ${s.cacheHits}, LLM calls: ${s.llmCalls}, tokens in/out: ${s.tokensIn}/${s.tokensOut}, time: ${s.ms}ms`,
  );

  return lines.join('\n');
}

function renderSourceOptions(lines: string[], resolved: ResolvedFinding): void {
  if (resolved.kind === 'new-only') {
    lines.push(`      → suggested key: ${resolved.optionB.key}`);
    return;
  }
  const A = resolved.optionA!;
  if (resolved.kind === 'reuse-only') {
    lines.push(`      → recommended: reuse existing key "${A.key}"`);
    lines.push(`         (already present in all locales — no locale-file edit needed)`);
    if (A.valueDivergesFromDetected) {
      lines.push(
        `         ⚠️  existing base value ${JSON.stringify(A.baseValue)} differs from the detected string — confirm they mean the same thing`,
      );
    }
    lines.push(`      → alternative: create new key "${resolved.optionB.key}" (only if semantics differ)`);
    return;
  }
  // reuse-or-new
  lines.push(`      → Option A: reuse existing key "${A.key}"`);
  lines.push(`         present in: ${A.presentInLocales.join(', ')}`);
  lines.push(`         missing in: ${A.missingLocales.join(', ')} (translations needed)`);
  if (A.valueDivergesFromDetected) {
    lines.push(
      `         ⚠️  existing base value ${JSON.stringify(A.baseValue)} differs from the detected string — confirm they mean the same thing`,
    );
  }
  lines.push(`      → Option B: create new key "${resolved.optionB.key}"`);
}

function renderLocaleChanges(
  result: ScanResult,
  resolvedByFinding: Map<Finding, ResolvedFinding>,
): string[] {
  type Entry = { key: string; value: string };
  // Two buckets per (platform, locale):
  //   - fills (Option A, missing locales)
  //   - news  (Option B, new key for all locales)
  type Bucket = {
    fillOptionA: Map<string, Entry[]>; // locale → entries to add for existing key
    newOptionB: Map<string, Entry[]>;  // locale → entries to add for new key
  };
  // Per-platform state tracks whether ANY finding on this platform had an
  // Option A (reuse-or-new); used to decide header labeling ("Option B" vs
  // just "add new keys").
  type PlatformState = Bucket & { hasAnyReuseOption: boolean };
  const perPlatform = new Map<Platform, PlatformState>();

  for (const [finding, resolved] of resolvedByFinding) {
    const platform = finding.platform;
    const b =
      perPlatform.get(platform) ??
      ({
        fillOptionA: new Map<string, Entry[]>(),
        newOptionB: new Map<string, Entry[]>(),
        hasAnyReuseOption: false,
      } as PlatformState);
    perPlatform.set(platform, b);

    if (resolved.kind === 'reuse-or-new') b.hasAnyReuseOption = true;

    // New-key entries (shown unless reuse-only fully covers the string)
    if (resolved.kind !== 'reuse-only') {
      for (const [locale, value] of Object.entries(finding.translations)) {
        (b.newOptionB.get(locale) ?? (b.newOptionB.set(locale, []), b.newOptionB.get(locale)!)).push({
          key: resolved.optionB.key,
          value,
        });
      }
    }
    // Option A missing-locales entries (only shown when partial match)
    if (resolved.kind === 'reuse-or-new' && resolved.optionA) {
      for (const locale of resolved.optionA.missingLocales) {
        const value = finding.translations[locale];
        if (value === undefined) continue;
        (b.fillOptionA.get(locale) ?? (b.fillOptionA.set(locale, []), b.fillOptionA.get(locale)!)).push({
          key: resolved.optionA.key,
          value,
        });
      }
    }
  }

  const out: string[] = [];

  const shouldShowPlatformTag = perPlatform.size > 1;

  for (const [platform, bucket] of perPlatform) {
    const targets = result.localeTargets[platform];
    const entriesByFile = result.localeEntriesByFile[platform] ?? {};
    if (!targets) continue;
    const tag = shouldShowPlatformTag ? ` [${platform}]` : '';

    if (bucket.fillOptionA.size > 0) {
      out.push('');
      out.push(`### Fill missing translations for existing keys${tag}`);
      renderEntriesBucket(out, bucket.fillOptionA, targets, entriesByFile, platform);
    }

    if (bucket.newOptionB.size > 0) {
      out.push('');
      const header = bucket.hasAnyReuseOption
        ? `### Alternative — add new key(s) instead${tag}`
        : `### Add new key(s)${tag}`;
      out.push(header);
      renderEntriesBucket(out, bucket.newOptionB, targets, entriesByFile, platform);
    }
  }

  return out;
}

function renderEntriesBucket(
  out: string[],
  byLocale: Map<string, Array<{ key: string; value: string }>>,
  targets: Record<string, LocaleFileTarget>,
  entriesByFile: Record<string, LocaleEntry[]>,
  platform: Platform,
): void {
  const locales = [...byLocale.keys()].sort();
  for (const locale of locales) {
    const target = targets[locale];
    const entries = byLocale.get(locale)!;
    if (!target) {
      out.push('');
      out.push(`  [${locale}] — no locale file found; create one and add:`);
      for (const e of entries) {
        out.push(`    ${renderEntry(platform, undefined, e.key, e.value)}`);
      }
      continue;
    }
    const rel = toRepoRelative(target.sourceFile);
    out.push('');
    out.push(`  ${rel}`);

    const fileEntries = entriesByFile[target.sourceFile] ?? [];
    type Group = {
      afterLine: number | null;
      matchedPrefix: string[] | null;
      lineless: boolean;
      items: Array<{ key: string; value: string }>;
    };
    const groups = new Map<string, Group>();
    for (const e of entries) {
      const ip = findInsertionPoint(fileEntries, e.key);
      const gk = ip.afterLine === null ? 'eof' : `after:${ip.afterLine}`;
      const g = groups.get(gk) ?? {
        afterLine: ip.afterLine,
        matchedPrefix: ip.matchedPrefix,
        lineless: ip.lineless,
        items: [],
      };
      g.items.push(e);
      groups.set(gk, g);
    }
    const ordered = [...groups.values()].sort((a, b) => {
      if (a.afterLine === null) return 1;
      if (b.afterLine === null) return -1;
      return a.afterLine - b.afterLine;
    });
    for (const g of ordered) {
      const header = renderGroupHeader(g, target);
      out.push(`    ${header}`);
      for (const e of g.items) {
        out.push(`      ${renderEntry(platform, target, e.key, e.value)}`);
      }
    }
  }
}

function renderGroupHeader(
  g: { afterLine: number | null; matchedPrefix: string[] | null; lineless: boolean },
  target: LocaleFileTarget,
): string {
  if (g.lineless) {
    if (g.matchedPrefix && g.matchedPrefix.length > 0) {
      return `within existing group "${g.matchedPrefix.join('.')}*":`;
    }
    return `add new entries:`;
  }
  if (g.afterLine === null) {
    return `append at line ${target.lineCount + 1} (end of file):`;
  }
  if (g.matchedPrefix && g.matchedPrefix.length > 0) {
    return `insert after line ${g.afterLine} (within "${g.matchedPrefix.join('.')}*" group):`;
  }
  return `insert after line ${g.afterLine}:`;
}

function renderEntry(
  platform: Platform,
  target: LocaleFileTarget | undefined,
  key: string,
  value: string,
): string {
  if (platform === 'ios') {
    const ext = target ? path.extname(target.sourceFile).toLowerCase() : '.strings';
    if (ext === '.xcstrings') {
      return `(xcstrings) add key "${key}" with stringUnit.value = ${JSON.stringify(value)}`;
    }
    return `"${key}" = ${JSON.stringify(value)};`;
  }
  return `<string name="${key}">${escapeAndroidXml(value)}</string>`;
}

function escapeAndroidXml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

function toRepoRelative(absPath: string): string {
  const home = process.env.HOME;
  if (home && absPath.startsWith(home)) {
    return '~' + absPath.slice(home.length);
  }
  return absPath;
}
