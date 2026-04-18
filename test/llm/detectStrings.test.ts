import { describe, expect, it, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { detectStringsInFile } from '../../src/llm/detectStrings.js';
import { FileCache } from '../../src/cache/fileStore.js';
import { makeFakeClient } from '../../src/llm/fake.js';
import { makeLogger } from '../../src/logger.js';
import type { ChangedFile, LocaleIndex, RunConfig } from '../../src/types.js';

const cfg: RunConfig = {
  repoRoot: '/tmp/repo',
  since: 'origin/main',
  window: undefined,
  full: false,
  platform: 'ios',
  outputFormat: 'text',
  cacheDir: '',
  failOn: 'none',
  model: 'claude-test',
  concurrency: 4,
  dryRun: false,
  verbose: false,
  ignore: [],
  recommend: true,
  includeTechnical: false,
  anthropicApiKey: 'test',
};

const logger = makeLogger(false);

const file: ChangedFile = {
  absPath: '/tmp/repo/App/Login.swift',
  repoRelPath: 'App/Login.swift',
  platform: 'ios',
  addedRanges: [{ startLine: 10, endLine: 12 }],
  addedContent: '10\tText("Welcome")\n11\tButton("Sign in")\n12\t// comment',
};

const index: LocaleIndex = {
  platform: 'ios',
  locales: ['en', 'pt'],
  baseLocale: 'en',
  keys: new Set(['common.ok']),
  entries: [{ key: 'common.ok', value: 'OK', locale: 'en', sourceFile: 'x' }],
};

describe('detectStringsInFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-det-'));
  });

  it('calls LLM on miss, caches on hit', async () => {
    const cache = new FileCache(dir);
    const llm = makeFakeClient({
      respond: () => ({
        findings: [
          {
            line: 10,
            string_literal: 'Welcome',
            is_user_facing: true,
            rationale: 'SwiftUI Text',
            suggested_key: 'login.welcome',
            translations: { en: 'Welcome', pt: 'Bem-vindo' },
          },
          {
            line: 11,
            string_literal: 'Sign in',
            is_user_facing: true,
            rationale: 'Button label',
            suggested_key: 'login.sign_in',
            translations: { en: 'Sign in', pt: 'Entrar' },
          },
        ],
      }),
    });

    const r1 = await detectStringsInFile({ cfg, llm, cache, logger }, file, index);
    expect(r1.cacheHit).toBe(false);
    expect(r1.findings).toHaveLength(2);
    expect(r1.findings[0]!.suggestedKey).toBe('login.welcome');
    expect(llm.callCount).toBe(1);

    const r2 = await detectStringsInFile({ cfg, llm, cache, logger }, file, index);
    expect(r2.cacheHit).toBe(true);
    expect(r2.findings).toHaveLength(2);
    expect(llm.callCount).toBe(1); // no new call
  });

  it('filters findings outside added ranges', async () => {
    const cache = new FileCache(dir);
    const llm = makeFakeClient({
      respond: () => ({
        findings: [
          {
            line: 5, // outside addedRanges 10-12
            string_literal: 'stray',
            is_user_facing: true,
            rationale: 'hallucinated',
            suggested_key: 'a.b',
            translations: { en: 'stray' },
          },
          {
            line: 11,
            string_literal: 'Sign in',
            is_user_facing: true,
            rationale: 'real',
            suggested_key: 'a.signin',
            translations: { en: 'Sign in' },
          },
        ],
      }),
    });

    const r = await detectStringsInFile({ cfg, llm, cache, logger }, file, index);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.line).toBe(11);
  });

  it('sorts findings by line', async () => {
    const cache = new FileCache(dir);
    const llm = makeFakeClient({
      respond: () => ({
        findings: [
          { line: 12, string_literal: 'c', is_user_facing: true, rationale: '', suggested_key: 'a.c', translations: { en: 'c' } },
          { line: 10, string_literal: 'a', is_user_facing: true, rationale: '', suggested_key: 'a.a', translations: { en: 'a' } },
          { line: 11, string_literal: 'b', is_user_facing: true, rationale: '', suggested_key: 'a.b', translations: { en: 'b' } },
        ],
      }),
    });

    const r = await detectStringsInFile({ cfg, llm, cache, logger }, file, index);
    expect(r.findings.map((f) => f.line)).toEqual([10, 11, 12]);
  });
});
