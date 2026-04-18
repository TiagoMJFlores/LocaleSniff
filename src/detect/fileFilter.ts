import path from 'node:path';

const IOS_EXTS = new Set(['.swift', '.m', '.mm']);
const ANDROID_CODE_EXTS = new Set(['.kt', '.java']);

/**
 * Returns true if the file looks like mobile source we should scan.
 * XML is only allowed under Android `res/` folders to avoid matching unrelated XML.
 */
export function shouldScanFile(repoRelPath: string): boolean {
  const ext = path.extname(repoRelPath).toLowerCase();
  if (IOS_EXTS.has(ext)) return true;
  if (ANDROID_CODE_EXTS.has(ext)) return true;
  if (ext === '.xml') {
    return repoRelPath.replace(/\\/g, '/').includes('/res/');
  }
  return false;
}
