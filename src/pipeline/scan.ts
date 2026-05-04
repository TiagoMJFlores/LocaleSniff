import pLimit from 'p-limit';
import { promises as fs } from 'node:fs';
import type {
  ChangedFile,
  LocaleCode,
  LocaleEntry,
  LocaleFileTarget,
  LocaleIndex,
  Platform,
  RunConfig,
  ScanResult,
} from '../types.js';
import type { Logger } from '../logger.js';
import type { LlmClient } from '../llm/client.js';
import type { FileCache } from '../cache/fileStore.js';
import { resolveScope } from '../git/scope.js';
import { loadLocaleIndex } from '../locale/index.js';
import { detectStringsInFile } from '../llm/detectStrings.js';
import { shouldSkipFile } from '../detect/prefilter.js';

export interface PipelineDeps {
  llm: LlmClient;
  cache: FileCache;
  logger: Logger;
}

export async function runScan(cfg: RunConfig, deps: PipelineDeps): Promise<ScanResult> {
  const start = Date.now();
  const scope = await resolveScope(cfg, deps.logger);
  deps.logger.debug(`scope: ${scope.description}, files: ${scope.files.length}`);

  const platformsUsed = new Set<Platform>(scope.files.map((f) => f.platform));
  const indexByPlatform = new Map<Platform, LocaleIndex | null>();
  for (const p of platformsUsed) {
    const idx = await loadLocaleIndex(cfg.repoRoot, p, deps.logger);
    indexByPlatform.set(p, idx);
  }

  const skipped: Array<{ file: string; reason: string }> = [];
  const eligible: ChangedFile[] = [];
  for (const f of scope.files) {
    const idx = indexByPlatform.get(f.platform);
    if (!idx) {
      skipped.push({ file: f.repoRelPath, reason: `no ${f.platform} locale files discovered in repo` });
      continue;
    }
    const prefilterReason = shouldSkipFile(f.addedContent, f.platform);
    if (prefilterReason) {
      skipped.push({ file: f.repoRelPath, reason: prefilterReason });
      continue;
    }
    eligible.push(f);
  }

  const limit = pLimit(cfg.concurrency);
  let cacheHits = 0;
  let llmCalls = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  const total = eligible.length;
  let completed = 0;
  // Show progress whenever the report is human-readable. JSON consumers parse
  // stdout, but progress goes to stderr and it would still be noise for them.
  // CI logs (Jenkins, etc.) ARE non-TTY but are exactly the place we still want
  // to see what's happening — so we don't gate on isTTY.
  const showProgress = cfg.outputFormat !== 'json';

  if (showProgress && total > 0) {
    process.stderr.write(`Scanning ${total} file${total === 1 ? '' : 's'}...\n`);
  }

  const allFindings = await Promise.all(
    eligible.map((file) =>
      limit(async () => {
        const idx = indexByPlatform.get(file.platform)!;
        const startedAt = Date.now();
        try {
          const res = await detectStringsInFile({ cfg, llm: deps.llm, cache: deps.cache, logger: deps.logger }, file, idx);
          if (res.cacheHit) cacheHits += 1;
          else llmCalls += 1;
          tokensIn += res.tokensIn;
          tokensOut += res.tokensOut;
          completed += 1;
          if (showProgress) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            const status = res.cacheHit ? 'cached' : `${elapsed}s`;
            const userFacing = res.findings.filter((f) => f.isUserFacing).length;
            const technical = res.findings.length - userFacing;
            const summary = userFacing > 0
              ? `${userFacing} user-facing${technical > 0 ? `, ${technical} technical` : ''}`
              : technical > 0
                ? `${technical} technical`
                : 'no findings';
            process.stderr.write(`  [${completed}/${total}] ${file.repoRelPath} — ${summary} (${status})\n`);
          }
          return res.findings;
        } catch (err) {
          completed += 1;
          if (showProgress) {
            process.stderr.write(`  [${completed}/${total}] ${file.repoRelPath} — failed\n`);
          }
          deps.logger.warn(`detect failed for ${file.repoRelPath}: ${(err as Error).message}`);
          skipped.push({ file: file.repoRelPath, reason: (err as Error).message });
          return [];
        }
      }),
    ),
  );

  const findings = allFindings.flat().sort((a, b) =>
    a.file.localeCompare(b.file) || (a.line - b.line) || a.stringLiteral.localeCompare(b.stringLiteral),
  );

  const localeTargets = await computeLocaleTargets(indexByPlatform, deps.logger);
  const localeEntriesByFile = groupEntriesByFile(indexByPlatform);
  const localeIndexes: Partial<Record<Platform, LocaleIndex>> = {};
  for (const [p, idx] of indexByPlatform) if (idx) localeIndexes[p] = idx;

  return {
    findings,
    skipped,
    stats: {
      filesScanned: eligible.length,
      cacheHits,
      llmCalls,
      tokensIn,
      tokensOut,
      ms: Date.now() - start,
    },
    localeTargets,
    localeEntriesByFile,
    localeIndexes,
  };
}

function groupEntriesByFile(
  indexByPlatform: Map<Platform, LocaleIndex | null>,
): Partial<Record<Platform, Record<string, LocaleEntry[]>>> {
  const out: Partial<Record<Platform, Record<string, LocaleEntry[]>>> = {};
  for (const [platform, idx] of indexByPlatform) {
    if (!idx) continue;
    const byFile: Record<string, LocaleEntry[]> = {};
    for (const e of idx.entries) {
      (byFile[e.sourceFile] ??= []).push(e);
    }
    out[platform] = byFile;
  }
  return out;
}

async function computeLocaleTargets(
  indexByPlatform: Map<Platform, LocaleIndex | null>,
  logger: Logger,
): Promise<Partial<Record<Platform, Record<LocaleCode, LocaleFileTarget>>>> {
  const out: Partial<Record<Platform, Record<LocaleCode, LocaleFileTarget>>> = {};
  for (const [platform, idx] of indexByPlatform) {
    if (!idx) continue;
    // Group entries by locale and pick the "canonical" source file per locale —
    // the one with the most entries (usually the main Localizable.strings).
    const byLocale = new Map<LocaleCode, Map<string, number>>();
    for (const e of idx.entries) {
      const filesForLocale = byLocale.get(e.locale) ?? new Map<string, number>();
      filesForLocale.set(e.sourceFile, (filesForLocale.get(e.sourceFile) ?? 0) + 1);
      byLocale.set(e.locale, filesForLocale);
    }
    const targets: Record<LocaleCode, LocaleFileTarget> = {};
    for (const [locale, filesForLocale] of byLocale) {
      let best: string | undefined;
      let bestCount = -1;
      for (const [f, count] of filesForLocale) {
        if (count > bestCount) {
          best = f;
          bestCount = count;
        }
      }
      if (!best) continue;
      let lineCount = 0;
      try {
        const content = await fs.readFile(best, 'utf8');
        lineCount = content.split('\n').length;
      } catch (err) {
        logger.debug(`could not read locale file ${best}: ${(err as Error).message}`);
      }
      targets[locale] = { sourceFile: best, lineCount };
    }
    out[platform] = targets;
  }
  return out;
}
