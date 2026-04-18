import 'dotenv/config';
import { Command } from 'commander';
import { resolveConfig, type RawCliOptions } from './config.js';
import { makeLogger } from './logger.js';
import { resolveScope } from './git/scope.js';
import { runScan } from './pipeline/scan.js';
import { makeAnthropicClient } from './llm/client.js';
import { FileCache } from './cache/fileStore.js';
import { renderText } from './report/text.js';
import { renderJson } from './report/json.js';
import { loadLocaleIndex } from './locale/index.js';
import { shouldSkipFile } from './detect/prefilter.js';
import type { FailOnMode, Platform, ScanResult } from './types.js';

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

const program = new Command();

program
  .name('localesniff')
  .description('Detect hardcoded user-facing strings in iOS/Android codebases and suggest externalized keys + translations.')
  .version('0.0.1');

program
  .command('scan')
  .description('Scan for hardcoded user-facing strings.')
  .option('--since <value>', 'Git ref or date expression to diff against', 'origin/main')
  .option('--window <duration>', 'Time window (e.g. 1w, 14d, 1m)')
  .option('--full', 'Scan all files, ignoring git diff')
  .option('--platform <platform>', 'ios | android | both', 'both')
  .option('--output-format <format>', 'text | json', 'text')
  .option('--cache-dir <path>', 'Cache directory', './.localesniff-cache')
  .option('--fail-on <mode>', 'none | any | user-facing', 'none')
  .option('--model <id>', 'Anthropic model id')
  .option('--concurrency <n>', 'LLM call concurrency', '4')
  .option('--repo <path>', 'Repo root', process.cwd())
  .option('--ignore <pattern...>', 'Glob patterns to exclude (repeatable). e.g. --ignore "**/*Tests*/**" "**/*Spec.swift"', collect, [])
  .option('--dry-run', 'Resolve scope and print files, without calling the LLM')
  .option('-v, --verbose', 'Verbose output')
  .action(async (opts: RawCliOptions) => {
    const cfg = resolveConfig(opts);
    const logger = makeLogger(cfg.verbose);

    try {
      if (cfg.dryRun) {
        const scope = await resolveScope(cfg, logger);
        console.log(`scope: ${scope.description}`);

        // Load locale index per platform used, so we can report "no locale files".
        const platformsUsed = new Set<Platform>(scope.files.map((f) => f.platform));
        const indexByPlatform = new Map<Platform, boolean>();
        for (const p of platformsUsed) {
          const idx = await loadLocaleIndex(cfg.repoRoot, p, logger);
          indexByPlatform.set(p, idx !== null);
        }

        const toAnalyze: typeof scope.files = [];
        const toSkip: Array<{ file: string; platform: Platform; reason: string }> = [];

        for (const f of scope.files) {
          if (!indexByPlatform.get(f.platform)) {
            toSkip.push({
              file: f.repoRelPath,
              platform: f.platform,
              reason: `no ${f.platform} locale files discovered in repo`,
            });
            continue;
          }
          const preReason = shouldSkipFile(f.addedContent, f.platform);
          if (preReason) {
            toSkip.push({ file: f.repoRelPath, platform: f.platform, reason: preReason });
            continue;
          }
          toAnalyze.push(f);
        }

        console.log('');
        console.log(`Will analyze (${toAnalyze.length}) — these will incur LLM cost:`);
        for (const f of toAnalyze) {
          const ranges = f.addedRanges
            .map((r) => (r.startLine === r.endLine ? String(r.startLine) : `${r.startLine}-${r.endLine}`))
            .join(',');
          console.log(`  [${f.platform}] ${f.repoRelPath} (added: ${ranges})`);
        }

        if (toSkip.length > 0) {
          console.log('');
          console.log(`Will skip at zero cost (${toSkip.length}):`);
          for (const s of toSkip) {
            console.log(`  [${s.platform}] ${s.file} — ${s.reason}`);
          }
        }

        console.log('');
        console.log(
          `Summary: ${scope.files.length} in scope · ${toAnalyze.length} to analyze · ${toSkip.length} skipped (zero cost)`,
        );
        return;
      }

      if (!cfg.anthropicApiKey) {
        logger.error('ANTHROPIC_API_KEY is not set. Put it in .env or export it before running.');
        process.exitCode = 2;
        return;
      }

      const llm = makeAnthropicClient(cfg.anthropicApiKey);
      const cache = new FileCache(cfg.cacheDir);
      const result = await runScan(cfg, { llm, cache, logger });

      const rendered = cfg.outputFormat === 'json' ? renderJson(result) : renderText(result);
      console.log(rendered);

      process.exitCode = computeExitCode(result, cfg.failOn);
    } catch (err) {
      logger.error((err as Error).message);
      process.exitCode = 2;
    }
  });

function computeExitCode(result: ScanResult, failOn: FailOnMode): number {
  if (failOn === 'none') return 0;
  if (failOn === 'any') return result.findings.length > 0 ? 1 : 0;
  // user-facing
  return result.findings.some((f) => f.isUserFacing) ? 1 : 0;
}

program.parseAsync(process.argv);
