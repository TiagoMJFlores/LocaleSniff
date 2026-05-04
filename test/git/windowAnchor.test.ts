import { describe, expect, it, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { resolveScope } from '../../src/git/scope.js';
import { makeLogger } from '../../src/logger.js';
import type { RunConfig } from '../../src/types.js';

/**
 * Regression test for the --window semantics bug: with the old (now-anchored)
 * implementation, running `--window=1w` on a repo whose most recent commit was
 * 3 weeks ago would return ZERO files. With the new (HEAD-anchored)
 * implementation, it should return the commits from the "last week of
 * activity" regardless of wall-clock time.
 */
describe('resolveScope --window anchors to HEAD date (bulletproof)', () => {
  let repo: string;
  const logger = makeLogger(false);

  const run = (cwd: string, cmd: string, env: Record<string, string> = {}) =>
    execSync(cmd, { cwd, stdio: 'pipe', env: { ...process.env, ...env } });

  const mkCfg = (overrides: Partial<RunConfig>): RunConfig => ({
    repoRoot: repo,
    since: 'origin/main',
    window: undefined,
    full: false,
    platform: 'both',
    outputFormat: 'text',
    cacheDir: '',
    failOn: 'none',
    model: 'test',
    concurrency: 1,
    dryRun: false,
    verbose: false,
    ignore: [],
    recommend: true,
    includeTechnical: false,
    anthropicApiKey: 'test',
    ...overrides,
  });

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-window-'));
    run(repo, 'git init -q');
    run(repo, 'git config user.email test@test');
    run(repo, 'git config user.name test');
    await fs.mkdir(path.join(repo, 'App'), { recursive: true });

    // Commit A: 60 days ago
    await fs.writeFile(path.join(repo, 'App', 'A.swift'), 'struct A {}\n');
    run(repo, 'git add -A');
    run(repo, 'git commit -q -m A', {
      GIT_AUTHOR_DATE: '2026-02-17T12:00:00',
      GIT_COMMITTER_DATE: '2026-02-17T12:00:00',
    });

    // Commit B: 25 days before HEAD (HEAD is commit C below, committed "today")
    // But we'll make HEAD be committed on a fixed date in the past, so "wall clock now"
    // is far ahead of HEAD — this is the scenario where the old logic failed.
    await fs.writeFile(path.join(repo, 'App', 'B.swift'), 'struct B {}\n');
    run(repo, 'git add -A');
    run(repo, 'git commit -q -m B', {
      GIT_AUTHOR_DATE: '2026-03-20T12:00:00',
      GIT_COMMITTER_DATE: '2026-03-20T12:00:00',
    });

    // Commit C (HEAD): 2 days before B. This is what anchors the window.
    // HEAD date = 2026-04-01 (older than "now" if now=2026-04-18).
    await fs.writeFile(path.join(repo, 'App', 'C.swift'), 'struct C {}\n');
    run(repo, 'git add -A');
    run(repo, 'git commit -q -m C', {
      GIT_AUTHOR_DATE: '2026-04-01T12:00:00',
      GIT_COMMITTER_DATE: '2026-04-01T12:00:00',
    });
    // History now (by commit date): A=2026-02-17, B=2026-03-20, C=HEAD=2026-04-01
  });

  it('--window=2w from HEAD includes B and C (last 2 weeks of activity), excludes A', async () => {
    // HEAD=2026-04-01; HEAD - 2w = 2026-03-18 → picks commit older than that = A
    // Diff A..HEAD should include B.swift and C.swift
    const scope = await resolveScope(mkCfg({ window: '2w' }), logger);
    expect(scope.mode).toBe('window');
    const paths = scope.files.map((f) => f.repoRelPath).sort();
    expect(paths).toEqual(['App/B.swift', 'App/C.swift']);
  });

  it('--window=1w from HEAD includes only C (last week of activity)', async () => {
    // HEAD=2026-04-01; HEAD - 1w = 2026-03-25 → picks commit older than that = B
    // Diff B..HEAD should include only C.swift
    const scope = await resolveScope(mkCfg({ window: '1w' }), logger);
    const paths = scope.files.map((f) => f.repoRelPath).sort();
    expect(paths).toEqual(['App/C.swift']);
  });

  it('--window is NOT anchored to wall-clock now (regression)', async () => {
    // If we anchored to "now" (wall clock), 1w ago would be recent (past HEAD),
    // and we would find NO commit older than that, causing either empty or error.
    // The new behavior anchors to HEAD date, so results are stable.
    const s1 = await resolveScope(mkCfg({ window: '1w' }), logger);
    // Sleep would not matter here, but the key property is independence from Date.now():
    expect(s1.files.length).toBeGreaterThan(0);
  });
});
