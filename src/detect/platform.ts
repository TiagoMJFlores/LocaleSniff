import path from 'node:path';
import type { Platform } from '../types.js';

/**
 * Infer platform purely from the file path. Returns null when we can't tell
 * (caller should skip the file).
 */
export function pathToPlatform(repoRelPath: string): Platform | null {
  const ext = path.extname(repoRelPath).toLowerCase();
  if (ext === '.swift' || ext === '.m' || ext === '.mm') return 'ios';
  if (ext === '.kt' || ext === '.java') return 'android';
  if (ext === '.xml') {
    // Only Android resource XML is in scope — see fileFilter.
    return 'android';
  }
  return null;
}
