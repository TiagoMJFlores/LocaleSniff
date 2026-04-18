import { createHash } from 'node:crypto';

export interface CacheKeyInput {
  model: string;
  promptVersion: string;
  filePath: string;
  addedContent: string;
  contextDigest: string;
  locales: string[];
}

export function cacheKey(input: CacheKeyInput): string {
  const h = createHash('sha256');
  h.update('model:' + input.model + '\n');
  h.update('prompt:' + input.promptVersion + '\n');
  h.update('file:' + input.filePath + '\n');
  h.update('ctx:' + input.contextDigest + '\n');
  h.update('locales:' + [...input.locales].sort().join(',') + '\n');
  h.update('added:\n');
  h.update(input.addedContent);
  return h.digest('hex');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
