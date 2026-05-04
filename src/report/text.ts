import path from 'node:path';
import type {
  Finding,
  LocaleEntry,
  LocaleFileTarget,
  Platform,
  RunConfig,
  ScanResult,
} from '../types.js';
import { findInsertionPoint } from '../locale/insertionPoint.js';
import { resolveMatch, type ResolvedFinding } from '../detect/resolveMatch.js';

export function renderText(result: ScanResult, cfg: RunConfig): string {
  const lines: string[] = [];
  lines.push('LocaleSniff report');
  lines.push('==================');

  const userFacingFindings = result.findings.filter((f) => f.isUserFacing);
  const technicalFindings = result.findings.filter((f) => !f.isUserFacing);

  // ───── Findings section (always present) ─────
  lines.push('');
  lines.push('## Findings (user-facing)');
  if (userFacingFindings.length === 0) {
    lines.push('  (none)');
  } else {
    const byFile = groupByFile(userFacingFindings);
    for (const [file, findings] of byFile) {
      lines.push('');
      for (const f of findings) {
        lines.push(`  ${file}:${f.line}`);
        lines.push(`    ${truncate(f.sourceLine || JSON.stringify(f.stringLiteral))}`);
        if (f.rationale) lines.push(`    (${f.rationale})`);
      }
    }
  }

  if (cfg.includeTechnical && technicalFindings.length > 0) {
    lines.push('');
    lines.push('## Findings (technical — classified as non-user-facing)');
    const byFile = groupByFile(technicalFindings);
    for (const [file, findings] of byFile) {
      lines.push('');
      for (const f of findings) {
        lines.push(`  ${file}:${f.line}`);
        lines.push(`    ${truncate(f.sourceLine || JSON.stringify(f.stringLiteral))}`);
        if (f.rationale) lines.push(`    (${f.rationale})`);
      }
    }
  } else if (technicalFindings.length > 0) {
    lines.push('');
    lines.push(`(${technicalFindings.length} technical strings ignored — re-run with --include-technical to see them)`);
  }

  // ───── Recommendations section (only when --recommend) ─────
  if (cfg.recommend && userFacingFindings.length > 0) {
    const resolvedByFinding = new Map<Finding, ResolvedFinding>();
    for (const f of userFacingFindings) {
      const idx = result.localeIndexes[f.platform];
      if (!idx) continue;
      resolvedByFinding.set(f, resolveMatch(f, idx));
    }

    lines.push('');
    lines.push('## Recommendations');
    renderRecommendations(lines, result, resolvedByFinding);
  } else if (!cfg.recommend && userFacingFindings.length > 0) {
    lines.push('');
    lines.push('(re-run with --recommend to get suggested keys, translations, and insertion points)');
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

function groupByFile(findings: Finding[]): Map<string, Finding[]> {
  const m = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = m.get(f.file) ?? [];
    arr.push(f);
    m.set(f.file, arr);
  }
  return m;
}

function renderRecommendations(
  lines: string[],
  result: ScanResult,
  resolvedByFinding: Map<Finding, ResolvedFinding>,
): void {
  // Per-finding source-file recommendation blurb.
  const byFile = new Map<string, Finding[]>();
  for (const f of resolvedByFinding.keys()) {
    (byFile.get(f.file) ?? (byFile.set(f.file, []), byFile.get(f.file)!)).push(f);
  }

  for (const [file, findings] of byFile) {
    lines.push('');
    lines.push(`  ${file}`);
    for (const f of findings) {
      const resolved = resolvedByFinding.get(f)!;
      lines.push(`    line ${f.line}:  ${truncate(f.sourceLine || JSON.stringify(f.stringLiteral))}`);
      lines.push(`       detected: ${JSON.stringify(f.stringLiteral)}`);
      renderSourceOptions(lines, resolved);
    }
  }

  // Per-platform locale-file changes.
  type Entry = { key: string; value: string };
  type Bucket = {
    fillOptionA: Map<string, Entry[]>;
    newOptionB: Map<string, Entry[]>;
    hasAnyReuseOption: boolean;
  };
  const perPlatform = new Map<Platform, Bucket>();

  for (const [finding, resolved] of resolvedByFinding) {
    const platform = finding.platform;
    const b =
      perPlatform.get(platform) ??
      ({
        fillOptionA: new Map<string, Entry[]>(),
        newOptionB: new Map<string, Entry[]>(),
        hasAnyReuseOption: false,
      } as Bucket);
    perPlatform.set(platform, b);
    if (resolved.kind === 'reuse-or-new') b.hasAnyReuseOption = true;

    if (resolved.kind !== 'reuse-only') {
      for (const [locale, value] of Object.entries(finding.translations)) {
        (b.newOptionB.get(locale) ?? (b.newOptionB.set(locale, []), b.newOptionB.get(locale)!)).push({
          key: resolved.optionB.key,
          value,
        });
      }
    }
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

  const showPlatformTag = perPlatform.size > 1;

  for (const [platform, bucket] of perPlatform) {
    const targets = result.localeTargets[platform];
    const entriesByFile = result.localeEntriesByFile[platform] ?? {};
    if (!targets) continue;
    const tag = showPlatformTag ? ` [${platform}]` : '';

    if (bucket.fillOptionA.size > 0) {
      lines.push('');
      lines.push(`### Fill missing translations for existing keys${tag}`);
      renderEntriesBucket(lines, bucket.fillOptionA, targets, entriesByFile, platform);
    }

    if (bucket.newOptionB.size > 0) {
      lines.push('');
      const header = bucket.hasAnyReuseOption
        ? `### Alternative — add new key(s) instead${tag}`
        : `### Add new key(s)${tag}`;
      lines.push(header);
      renderEntriesBucket(lines, bucket.newOptionB, targets, entriesByFile, platform);
    }
  }
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
      anchorKey: string | null;
      lineless: boolean;
      items: Array<{ key: string; value: string }>;
    };
    const groups = new Map<string, Group>();
    for (const e of entries) {
      const ip = findInsertionPoint(fileEntries, e.key);
      const gk = ip.anchorKey ?? 'eof';
      const g =
        groups.get(gk) ??
        ({
          afterLine: ip.afterLine,
          matchedPrefix: ip.matchedPrefix,
          anchorKey: ip.anchorKey,
          lineless: ip.lineless,
          items: [],
        } as Group);
      g.items.push(e);
      groups.set(gk, g);
    }
    const ordered = [...groups.values()].sort((a, b) => {
      if (a.afterLine === null) return 1;
      if (b.afterLine === null) return -1;
      return a.afterLine - b.afterLine;
    });
    for (const g of ordered) {
      out.push(`    ${renderGroupHeader(g, target)}`);
      for (const e of g.items) {
        out.push(`      ${renderEntry(platform, target, e.key, e.value)}`);
      }
    }
  }
}

function renderGroupHeader(
  g: {
    afterLine: number | null;
    matchedPrefix: string[] | null;
    anchorKey: string | null;
    lineless: boolean;
  },
  target: LocaleFileTarget,
): string {
  if (g.anchorKey) {
    if (g.lineless) {
      return `insert after key "${g.anchorKey}":`;
    }
    if (typeof g.afterLine === 'number') {
      return `insert after key "${g.anchorKey}" (line ${g.afterLine}):`;
    }
    return `insert after key "${g.anchorKey}":`;
  }
  // no anchor — EOF fallback
  if (g.lineless) {
    return `append at end of file:`;
  }
  return `append at line ${target.lineCount + 1} (end of file):`;
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

function truncate(s: string, max = 140): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + '…' + s.slice(s.length - half);
}

function toRepoRelative(absPath: string): string {
  const home = process.env.HOME;
  if (home && absPath.startsWith(home)) {
    return '~' + absPath.slice(home.length);
  }
  return absPath;
}
