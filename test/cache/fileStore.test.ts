import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileCache } from '../../src/cache/fileStore.js';
import { cacheKey, sha256 } from '../../src/cache/key.js';

describe('FileCache', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-cache-'));
  });

  afterAll(async () => {
    // best-effort cleanup — beforeEach created many dirs
  });

  it('round-trips values', async () => {
    const c = new FileCache(dir);
    await c.set('abc', { hello: 'world' });
    expect(await c.get<{ hello: string }>('abc')).toEqual({ hello: 'world' });
  });

  it('returns undefined for missing keys', async () => {
    const c = new FileCache(dir);
    expect(await c.get('missing')).toBeUndefined();
  });

  it('treats corrupted files as miss', async () => {
    const c = new FileCache(dir);
    await c.set('deadbeef', 'ok');
    // corrupt it
    const p = path.join(dir, 'de', 'deadbeef.json');
    await fs.writeFile(p, '{ not valid json');
    expect(await c.get('deadbeef')).toBeUndefined();
  });
});

describe('cacheKey', () => {
  it('is deterministic', () => {
    const a = cacheKey({
      model: 'claude-test',
      promptVersion: 'v1',
      filePath: 'a.swift',
      addedContent: 'Text("Hi")',
      contextDigest: sha256('ctx'),
      locales: ['en', 'pt'],
    });
    const b = cacheKey({
      model: 'claude-test',
      promptVersion: 'v1',
      filePath: 'a.swift',
      addedContent: 'Text("Hi")',
      contextDigest: sha256('ctx'),
      locales: ['pt', 'en'], // different order, same set
    });
    expect(a).toBe(b);
  });

  it('changes when any input changes', () => {
    const base = {
      model: 'claude-test',
      promptVersion: 'v1',
      filePath: 'a.swift',
      addedContent: 'Text("Hi")',
      contextDigest: sha256('ctx'),
      locales: ['en'],
    };
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, model: 'other' }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, promptVersion: 'v2' }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, filePath: 'b.swift' }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, addedContent: 'Text("Bye")' }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, contextDigest: sha256('other') }));
    expect(cacheKey(base)).not.toBe(cacheKey({ ...base, locales: ['en', 'pt'] }));
  });
});
