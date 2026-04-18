import pLimit from 'p-limit';
import type { ChangedFile, LocaleIndex, Platform, RunConfig, ScanResult } from '../types.js';
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

  const allFindings = await Promise.all(
    eligible.map((file) =>
      limit(async () => {
        const idx = indexByPlatform.get(file.platform)!;
        try {
          const res = await detectStringsInFile({ cfg, llm: deps.llm, cache: deps.cache, logger: deps.logger }, file, idx);
          if (res.cacheHit) cacheHits += 1;
          else llmCalls += 1;
          tokensIn += res.tokensIn;
          tokensOut += res.tokensOut;
          return res.findings;
        } catch (err) {
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
  };
}
