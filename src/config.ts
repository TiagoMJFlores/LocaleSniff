import path from 'node:path';
import type { FailOnMode, LlmProvider, OutputFormat, PlatformFilter, RunConfig } from './types.js';

export interface RawCliOptions {
  since?: string;
  window?: string;
  full?: boolean;
  platform?: string;
  outputFormat?: string;
  cacheDir?: string;
  failOn?: string;
  provider?: string;
  model?: string;
  concurrency?: string;
  repo?: string;
  dryRun?: boolean;
  verbose?: boolean;
  ignore?: string[];
  recommend?: boolean;
  includeTechnical?: boolean;
}

export function resolveConfig(opts: RawCliOptions): RunConfig {
  const repoRoot = path.resolve(opts.repo ?? process.cwd());
  const defaultSince = process.env.LOCALESNIFF_DEFAULT_SINCE ?? 'origin/main';
  const provider = normalizeProvider(opts.provider) ?? envProvider();
  const model = opts.model ?? process.env.LOCALESNIFF_MODEL;
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
    provider,
    model,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 4,
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose),
    ignore: Array.isArray(opts.ignore) ? opts.ignore : [],
    recommend: Boolean(opts.recommend),
    includeTechnical: Boolean(opts.includeTechnical),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
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

function normalizeProvider(v: string | undefined): LlmProvider | undefined {
  if (v === 'anthropic' || v === 'openai') return v;
  return undefined;
}

function envProvider(): LlmProvider | undefined {
  const fromEnv = process.env.LOCALESNIFF_PROVIDER?.toLowerCase();
  if (fromEnv === 'anthropic' || fromEnv === 'openai') return fromEnv;
  return undefined;
}
