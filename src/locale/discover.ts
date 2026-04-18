import path from 'node:path';
import fg from 'fast-glob';
import type { Platform } from '../types.js';

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/Pods/**',
  '**/build/**',
  '**/DerivedData/**',
  '**/.git/**',
];

export interface DiscoveredLocaleFiles {
  iosStrings: string[];       // absolute paths to Localizable.strings
  iosXcstrings: string[];     // absolute paths to .xcstrings
  androidStrings: string[];   // absolute paths to res/values*/strings.xml
}

export async function discoverLocaleFiles(repoRoot: string): Promise<DiscoveredLocaleFiles> {
  const [iosStrings, iosXcstrings, androidStrings] = await Promise.all([
    fg(['**/*.lproj/Localizable.strings'], { cwd: repoRoot, absolute: true, ignore: DEFAULT_IGNORE }),
    fg(['**/*.xcstrings'], { cwd: repoRoot, absolute: true, ignore: DEFAULT_IGNORE }),
    fg(['**/res/values/strings.xml', '**/res/values-*/strings.xml'], {
      cwd: repoRoot,
      absolute: true,
      ignore: DEFAULT_IGNORE,
    }),
  ]);
  return { iosStrings, iosXcstrings, androidStrings };
}

export function filterForPlatform(files: DiscoveredLocaleFiles, platform: Platform): DiscoveredLocaleFiles {
  if (platform === 'ios') {
    return { iosStrings: files.iosStrings, iosXcstrings: files.iosXcstrings, androidStrings: [] };
  }
  return { iosStrings: [], iosXcstrings: [], androidStrings: files.androidStrings };
}

// Exported for tests / logging.
export function summarize(files: DiscoveredLocaleFiles): string {
  const lines = [
    `ios .strings: ${files.iosStrings.length}`,
    `ios .xcstrings: ${files.iosXcstrings.length}`,
    `android strings.xml: ${files.androidStrings.length}`,
  ];
  return lines.join('; ');
}

// Re-exported for caller convenience.
export { path };
