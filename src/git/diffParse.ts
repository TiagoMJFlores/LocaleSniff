import type { AddedRange } from '../types.js';

export interface ParsedFileDiff {
  repoRelPath: string;
  addedRanges: AddedRange[];
  /**
   * Added lines joined by '\n', each prefixed with its post-image line number
   * and a tab — e.g. `42\tText("Hello")`. Binary / deleted files produce an empty string.
   */
  addedContent: string;
  isNewFile: boolean;
  isBinary: boolean;
}

/**
 * Parse a unified diff (expected to be produced with `git diff --unified=0`).
 * Only extracts added lines and their post-image line numbers; everything else
 * is ignored. Robust to multiple files, renames, new files, and binary files.
 */
export function parseUnifiedDiff(diff: string): ParsedFileDiff[] {
  const files: ParsedFileDiff[] = [];
  const lines = diff.split(/\r?\n/);

  let current: ParsedFileDiff | null = null;
  let postLine = 0;
  let remainingInHunk = 0;
  let inHunk = false;
  const addedSegments: string[] = [];
  let currentRangeStart = 0;
  let currentRangeEnd = 0;

  const flushRange = () => {
    if (current && currentRangeStart !== 0) {
      current.addedRanges.push({ startLine: currentRangeStart, endLine: currentRangeEnd });
      currentRangeStart = 0;
      currentRangeEnd = 0;
    }
  };

  const flushFile = () => {
    flushRange();
    if (current) {
      current.addedContent = addedSegments.join('\n');
      files.push(current);
    }
    current = null;
    addedSegments.length = 0;
    inHunk = false;
    remainingInHunk = 0;
  };

  for (const raw of lines) {
    if (raw.startsWith('diff --git ')) {
      flushFile();
      // `diff --git a/PATH b/PATH`
      const match = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
      const relPath = match ? match[2]! : '';
      current = {
        repoRelPath: relPath,
        addedRanges: [],
        addedContent: '',
        isNewFile: false,
        isBinary: false,
      };
      continue;
    }
    if (!current) continue;

    if (raw.startsWith('new file mode')) {
      current.isNewFile = true;
      continue;
    }
    if (raw.startsWith('Binary files ')) {
      current.isBinary = true;
      continue;
    }
    if (raw.startsWith('+++ b/')) {
      // Authoritative post-image path (wins over the `diff --git` header on renames).
      current.repoRelPath = raw.slice(6);
      continue;
    }
    if (raw.startsWith('@@')) {
      flushRange();
      // `@@ -oldStart,oldCount +newStart,newCount @@`
      const m = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        postLine = parseInt(m[1]!, 10);
        remainingInHunk = m[2] === undefined ? 1 : parseInt(m[2]!, 10);
        inHunk = true;
      }
      continue;
    }

    if (!inHunk) continue;

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const content = raw.slice(1);
      addedSegments.push(`${postLine}\t${content}`);
      if (currentRangeStart === 0) {
        currentRangeStart = postLine;
        currentRangeEnd = postLine;
      } else if (postLine === currentRangeEnd + 1) {
        currentRangeEnd = postLine;
      } else {
        // non-contiguous; close previous range and start new
        current.addedRanges.push({ startLine: currentRangeStart, endLine: currentRangeEnd });
        currentRangeStart = postLine;
        currentRangeEnd = postLine;
      }
      postLine += 1;
      remainingInHunk -= 1;
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      // deletions do not advance the post-image line counter or the
      // remaining-in-hunk budget (which tracks post-image lines only).
    } else if (raw.startsWith(' ')) {
      // context line (shouldn't happen with --unified=0 but harmless)
      postLine += 1;
      remainingInHunk -= 1;
    }

    if (remainingInHunk <= 0) {
      inHunk = false;
    }
  }

  flushFile();
  return files;
}
