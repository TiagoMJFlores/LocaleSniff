import { describe, expect, it, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { runScan } from '../../src/pipeline/scan.js';
import { FileCache } from '../../src/cache/fileStore.js';
import { makeFakeClient } from '../../src/llm/fake.js';
import { makeLogger } from '../../src/logger.js';
import type { RunConfig } from '../../src/types.js';

/**
 * End-to-end pipeline test: creates a tiny git repo with iOS+Android files
 * and one commit that adds user-facing strings. Uses the fake LLM so no
 * network is touched.
 */
describe('runScan (end-to-end with fake LLM)', () => {
  let repo: string;
  let cacheDir: string;

  const run = (cwd: string, cmd: string) => execSync(cmd, { cwd, stdio: 'pipe' });

  beforeEach(async () => {
    repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-pipeline-'));
    cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-pipeline-cache-'));
    run(repo, 'git init -q');
    run(repo, 'git config user.email test@test');
    run(repo, 'git config user.name test');

    // initial commit: empty project scaffolding + base locale files
    await fs.mkdir(path.join(repo, 'App', 'en.lproj'), { recursive: true });
    await fs.mkdir(path.join(repo, 'android', 'res', 'values'), { recursive: true });
    await fs.writeFile(path.join(repo, 'App', 'en.lproj', 'Localizable.strings'), '"common.ok" = "OK";');
    await fs.writeFile(
      path.join(repo, 'android', 'res', 'values', 'strings.xml'),
      '<resources><string name="app_name">MyApp</string></resources>',
    );
    run(repo, 'git add -A');
    run(repo, 'git commit -q -m initial');

    // second commit: adds a swift file with user-facing strings
    await fs.writeFile(
      path.join(repo, 'App', 'Login.swift'),
      'import SwiftUI\nstruct Login: View { var body: some View { Text("Sign in") } }\n',
    );
    run(repo, 'git add -A');
    run(repo, 'git commit -q -m add-login');
  });

  const cfgFor = (repoRoot: string, cacheDir: string): RunConfig => ({
    repoRoot,
    since: 'HEAD~1',
    window: undefined,
    full: false,
    platform: 'both',
    outputFormat: 'text',
    cacheDir,
    failOn: 'none',
    model: 'claude-test',
    concurrency: 2,
    dryRun: false,
    verbose: false,
    ignore: [],
    recommend: true,
    includeTechnical: false,
    anthropicApiKey: 'test',
  });

  it('scans diff, calls LLM, caches, and returns a ScanResult', async () => {
    const cfg = cfgFor(repo, cacheDir);
    const llm = makeFakeClient({
      respond: () => ({
        findings: [
          {
            line: 2,
            string_literal: 'Sign in',
            is_user_facing: true,
            rationale: 'SwiftUI Text',
            suggested_key: 'login.sign_in',
            translations: { en: 'Sign in' },
          },
        ],
      }),
    });
    const cache = new FileCache(cacheDir);
    const logger = makeLogger(false);

    const first = await runScan(cfg, { llm, cache, logger });
    expect(first.findings).toHaveLength(1);
    expect(first.findings[0]!.file).toBe('App/Login.swift');
    expect(first.findings[0]!.suggestedKey).toBe('login.sign_in');
    expect(first.stats.filesScanned).toBe(1);
    expect(first.stats.llmCalls).toBe(1);
    expect(first.stats.cacheHits).toBe(0);

    const second = await runScan(cfg, { llm, cache, logger });
    expect(second.stats.cacheHits).toBe(1);
    expect(second.stats.llmCalls).toBe(0);
    expect(llm.callCount).toBe(1); // total across both runs
  });

  it('pre-filter skips files with no string literals at zero cost', async () => {
    // Add a swift file with ZERO string literals and commit it.
    const { execSync: run2 } = await import('node:child_process');
    await fs.writeFile(
      path.join(repo, 'App', 'Model.swift'),
      'struct Payment {\n  let amount: Int\n  let currency: Int\n}\n',
    );
    run2('git add -A && git commit -q -m add-model', { cwd: repo, stdio: 'pipe' });

    const cfg = cfgFor(repo, cacheDir);
    const llm = makeFakeClient({
      respond: () => ({ findings: [] }),
    });
    const cache = new FileCache(cacheDir);
    const logger = makeLogger(false);

    // Scope now includes Model.swift (latest commit). Pre-filter should skip it.
    const result = await runScan({ ...cfg, since: 'HEAD~1' }, { llm, cache, logger });
    expect(llm.callCount).toBe(0); // no LLM calls
    expect(result.stats.llmCalls).toBe(0);
    expect(result.skipped.some((s) => s.file.endsWith('Model.swift') && /no string literals/.test(s.reason))).toBe(true);
  });
});
