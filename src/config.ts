import path from 'node:path';
import type { FailOnMode, OutputFormat, PlatformFilter, RunConfig } from './types.js';

export interface RawCliOptions {
  since?: string;
  window?: string;
  full?: boolean;
  platform?: string;
  outputFormat?: string;
  cacheDir?: string;
  failOn?: string;
  model?: string;
  concurrency?: string;
  repo?: string;
  dryRun?: boolean;
  verbose?: boolean;
  ignore?: string[];
}

export function resolveConfig(opts: RawCliOptions): RunConfig {
  const repoRoot = path.resolve(opts.repo ?? process.cwd());
  const defaultSince = process.env.LOCALESNIFF_DEFAULT_SINCE ?? 'origin/main';
  const model = opts.model ?? process.env.LOCALESNIFF_MODEL ?? 'claude-sonnet-4-5';
  const concurrency = parseInt(opts.concurrency ?? '4', 10);

  return {
    repoRoot,
    since: opts.since ?? defaultSince,
    window: opts.window,
    full: Boolean(opts.full),
    platform: normalizePlatform(opts.platform),
    outputFormat: normalizeOutputFormat(opts.outputFormat),
    cacheDir: path.resolve(repoRoot, opts.cacheDir ?? './.localesniff-cache'),
    failOn: normalizeFailOn(opts.failOn),
    model,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 4,
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose),
    ignore: Array.isArray(opts.ignore) ? opts.ignore : [],
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}

function normalizePlatform(v: string | undefined): PlatformFilter {
  if (v === 'ios' || v === 'android' || v === 'both') return v;
  return 'both';
}

function normalizeOutputFormat(v: string | undefined): OutputFormat {
  return v === 'json' ? 'json' : 'text';
}

function normalizeFailOn(v: string | undefined): FailOnMode {
  if (v === 'any' || v === 'user-facing') return v;
  return 'none';
}
