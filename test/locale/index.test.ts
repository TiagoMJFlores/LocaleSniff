import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadLocaleIndex } from '../../src/locale/index.js';
import { makeLogger } from '../../src/logger.js';

describe('loadLocaleIndex', () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-locale-'));

    // iOS fixture
    const iosEn = path.join(tmp, 'App', 'en.lproj');
    const iosPt = path.join(tmp, 'App', 'pt.lproj');
    await fs.mkdir(iosEn, { recursive: true });
    await fs.mkdir(iosPt, { recursive: true });
    await fs.writeFile(
      path.join(iosEn, 'Localizable.strings'),
      '"welcome" = "Welcome";\n"bye" = "Bye";',
    );
    await fs.writeFile(
      path.join(iosPt, 'Localizable.strings'),
      '"welcome" = "Bem-vindo";',
    );

    // Android fixture
    const andBase = path.join(tmp, 'app', 'src', 'main', 'res', 'values');
    const andFr = path.join(tmp, 'app', 'src', 'main', 'res', 'values-fr');
    await fs.mkdir(andBase, { recursive: true });
    await fs.mkdir(andFr, { recursive: true });
    await fs.writeFile(
      path.join(andBase, 'strings.xml'),
      '<resources><string name="app_name">MyApp</string></resources>',
    );
    await fs.writeFile(
      path.join(andFr, 'strings.xml'),
      '<resources><string name="app_name">MonApp</string></resources>',
    );
  });

  afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const logger = makeLogger(false);

  it('loads iOS index', async () => {
    const idx = await loadLocaleIndex(tmp, 'ios', logger);
    expect(idx).not.toBeNull();
    expect(idx!.locales).toEqual(['en', 'pt']);
    expect(idx!.baseLocale).toBe('en');
    expect(idx!.keys).toEqual(new Set(['welcome', 'bye']));
    expect(idx!.entries).toHaveLength(3);
  });

  it('loads Android index', async () => {
    const idx = await loadLocaleIndex(tmp, 'android', logger);
    expect(idx).not.toBeNull();
    expect(idx!.locales).toEqual(['en', 'fr']);
    expect(idx!.baseLocale).toBe('en');
    expect(idx!.keys).toEqual(new Set(['app_name']));
    expect(idx!.entries).toHaveLength(2);
  });
});
