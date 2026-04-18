import path from 'node:path';
import { promises as fs } from 'node:fs';
import fg from 'fast-glob';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { ChangedFile, RunConfig } from '../types.js';
import type { Logger } from '../logger.js';
import { shouldScanFile } from '../detect/fileFilter.js';
import { pathToPlatform } from '../detect/platform.js';
import { parseUnifiedDiff } from './diffParse.js';

export interface ResolvedScope {
  mode: 'ref' | 'date' | 'window' | 'full';
  description: string;
  files: ChangedFile[];
}

/**
 * Resolve the set of files to scan, based on `--full` / `--window` / `--since`.
 *
 * Precedence: --full > --window > --since. Defaults to --since=origin/main.
 *
 * Semantics:
 *   --since=<ref>   : diff <ref>...HEAD
 *   --since=<date>  : cutoff anchored to wall-clock "now"; finds first commit
 *                     older than that absolute date; diff <sha>..HEAD
 *   --window=<dur>  : cutoff anchored to HEAD's commit date (NOT to "now");
 *                     so asking for "last 1 week of activity" always shows the
 *                     last week of commits even if the repo has been inactive.
 */
export async function resolveScope(cfg: RunConfig, logger: Logger): Promise<ResolvedScope> {
  if (cfg.full) {
    const files = await fullScan(cfg);
    return { mode: 'full', description: 'full scan (git ignored)', files };
  }

  const git = simpleGit({ baseDir: cfg.repoRoot });

  // Window mode: anchor to HEAD's commit date to guarantee "last N of activity".
  if (cfg.window) {
    const headDateIso = await getHeadCommitDate(git);
    if (!headDateIso) {
      throw new Error('Could not determine HEAD commit date — is this a valid git repository with at least one commit?');
    }
    const cutoffIso = subtractWindowFromDate(headDateIso, cfg.window);
    const sha = await resolveDateToSha(git, cutoffIso);
    if (!sha) {
      // Fallback: diff against the root commit (= "everything since the repo started").
      const root = await firstCommitSha(git);
      if (!root) {
        throw new Error(`No commits older than HEAD-${cfg.window} found and no root commit available.`);
      }
      const files = await diffAgainst(git, cfg, logger, `${root}..HEAD`);
      return {
        mode: 'window',
        description: `diff ${root}..HEAD (window ${cfg.window} anchored to HEAD ${headDateIso}; older than root)`,
        files,
      };
    }
    const files = await diffAgainst(git, cfg, logger, `${sha}..HEAD`);
    return {
      mode: 'window',
      description: `diff ${sha}..HEAD (window ${cfg.window} anchored to HEAD ${headDateIso})`,
      files,
    };
  }

  // Since mode.
  const sinceValue = cfg.since;

  const asRef = await tryResolveRef(git, sinceValue);
  if (asRef) {
    const files = await diffAgainst(git, cfg, logger, `${asRef}...HEAD`);
    return { mode: 'ref', description: `diff ${asRef}...HEAD`, files };
  }

  const sha = await resolveDateToSha(git, sinceValue);
  if (!sha) {
    throw new Error(
      `Could not resolve --since=${JSON.stringify(sinceValue)} as a git ref or as a date expression.`,
    );
  }
  const files = await diffAgainst(git, cfg, logger, `${sha}..HEAD`);
  return { mode: 'date', description: `diff ${sha}..HEAD (since ${sinceValue})`, files };
}

async function getHeadCommitDate(git: SimpleGit): Promise<string | null> {
  try {
    const out = await git.raw(['log', '-1', '--format=%cI', 'HEAD']);
    const iso = out.trim();
    return iso.length > 0 ? iso : null;
  } catch {
    return null;
  }
}

async function firstCommitSha(git: SimpleGit): Promise<string | null> {
  try {
    const out = await git.raw(['rev-list', '--max-parents=0', 'HEAD']);
    const lines = out.trim().split('\n').filter(Boolean);
    return lines[lines.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function tryResolveRef(git: SimpleGit, value: string): Promise<string | null> {
  try {
    const out = await git.raw(['rev-parse', '--verify', '--quiet', value]);
    const trimmed = out.trim();
    return trimmed.length > 0 ? value : null;
  } catch {
    return null;
  }
}

async function resolveDateToSha(git: SimpleGit, dateExpr: string): Promise<string | null> {
  try {
    const out = await git.raw(['rev-list', '-n', '1', `--before=${dateExpr}`, 'HEAD']);
    const sha = out.trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

async function diffAgainst(
  git: SimpleGit,
  cfg: RunConfig,
  logger: Logger,
  range: string,
): Promise<ChangedFile[]> {
  const diffText = await git.raw(['diff', '--unified=0', range, '--']);
  const parsed = parseUnifiedDiff(diffText);
  const files: ChangedFile[] = [];

  for (const entry of parsed) {
    if (entry.isBinary) continue;
    if (!entry.repoRelPath) continue;
    if (!shouldScanFile(entry.repoRelPath)) continue;
    if (matchesAnyIgnore(entry.repoRelPath, cfg.ignore)) {
      logger.debug(`skip ${entry.repoRelPath}: matched --ignore`);
      continue;
    }

    const platform = pathToPlatform(entry.repoRelPath);
    if (!platform) continue;
    if (cfg.platform !== 'both' && cfg.platform !== platform) continue;

    const absPath = path.resolve(cfg.repoRoot, entry.repoRelPath);

    if (entry.addedRanges.length === 0) {
      logger.debug(`skip ${entry.repoRelPath}: no added lines`);
      continue;
    }

    files.push({
      absPath,
      repoRelPath: entry.repoRelPath,
      platform,
      addedRanges: entry.addedRanges,
      addedContent: entry.addedContent,
    });
  }

  return files;
}

/**
 * Match a repo-relative path against a list of glob-like patterns. Supports
 * `*`, `**`, and literal segments. Separator is forward slash.
 */
export function matchesAnyIgnore(repoRelPath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const norm = repoRelPath.replace(/\\/g, '/');
  return patterns.some((p) => matchGlob(norm, p.replace(/\\/g, '/')));
}

function matchGlob(str: string, pattern: string): boolean {
  // Build regex from glob: ** → .*, * → [^/]*, literal chars escaped.
  let re = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\.+^$|(){}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  re += '$';
  return new RegExp(re).test(str);
}

async function fullScan(cfg: RunConfig): Promise<ChangedFile[]> {
  const patterns = [
    '**/*.swift',
    '**/*.m',
    '**/*.mm',
    '**/*.kt',
    '**/*.java',
    '**/res/**/*.xml',
  ];
  const ignore = ['**/node_modules/**', '**/Pods/**', '**/build/**', '**/.git/**', '**/DerivedData/**'];
  const rel = await fg(patterns, { cwd: cfg.repoRoot, ignore, onlyFiles: true, dot: false });

  const files: ChangedFile[] = [];
  for (const r of rel) {
    if (!shouldScanFile(r)) continue;
    const platform = pathToPlatform(r);
    if (!platform) continue;
    if (cfg.platform !== 'both' && cfg.platform !== platform) continue;

    const absPath = path.resolve(cfg.repoRoot, r);
    let content = '';
    try {
      content = await fs.readFile(absPath, 'utf8');
    } catch {
      continue;
    }
    const numbered = content.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n');
    const lineCount = content.split('\n').length;
    files.push({
      absPath,
      repoRelPath: r,
      platform,
      addedRanges: [{ startLine: 1, endLine: lineCount }],
      addedContent: numbered,
    });
  }
  return files;
}

/**
 * Convert a duration string like `1w`, `14d`, `2w`, `1m` to a git-parsable
 * date expression. Keeps it predictable — only these units for MVP.
 *
 * Still used for back-compat where callers may want a "now-anchored" date
 * string, but `resolveScope` now uses `subtractWindowFromDate` instead to
 * anchor the window to HEAD's commit date.
 */
export function windowToDateExpr(window: string): string {
  const { n, unitLabel } = parseWindow(window);
  return `${n} ${unitLabel}${n === 1 ? '' : 's'} ago`;
}

interface ParsedWindow {
  n: number;
  unit: 'd' | 'w' | 'm';
  unitLabel: 'day' | 'week' | 'month';
}

function parseWindow(window: string): ParsedWindow {
  const m = window.trim().match(/^(\d+)\s*([dwm])$/i);
  if (!m) {
    throw new Error(`Invalid --window: ${JSON.stringify(window)}. Expected e.g. '7d', '2w', '1m'.`);
  }
  const n = parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase() as 'd' | 'w' | 'm';
  const unitLabel = unit === 'd' ? 'day' : unit === 'w' ? 'week' : 'month';
  return { n, unit, unitLabel };
}

/**
 * Subtract a window duration from an ISO-8601 date and return a git-parseable
 * ISO date. Months are treated as calendar months (Date.setUTCMonth handles
 * day-of-month rollover reasonably).
 */
export function subtractWindowFromDate(isoDate: string, window: string): string {
  const { n, unit } = parseWindow(window);
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid anchor date: ${JSON.stringify(isoDate)}`);
  }
  if (unit === 'd') {
    d.setUTCDate(d.getUTCDate() - n);
  } else if (unit === 'w') {
    d.setUTCDate(d.getUTCDate() - n * 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() - n);
  }
  return d.toISOString();
}
