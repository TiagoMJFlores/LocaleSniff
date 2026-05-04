import type { ChangedFile, Finding, LocaleIndex, RunConfig } from '../types.js';
import type { LlmClient } from './client.js';
import type { FileCache } from '../cache/fileStore.js';
import type { Logger } from '../logger.js';
import { selectContext } from '../detect/contextSelection.js';
import { buildPrompt } from '../detect/buildPrompt.js';
import { cacheKey } from '../cache/key.js';
import { PROMPT_VERSION, type DetectResponse, type RawFinding } from './schema.js';

export interface DetectFileResult {
  findings: Finding[];
  cacheHit: boolean;
  tokensIn: number;
  tokensOut: number;
}

export interface DetectDeps {
  cfg: RunConfig;
  llm: LlmClient;
  cache: FileCache;
  logger: Logger;
}

/**
 * Detect hardcoded strings in a single changed file by consulting the cache
 * first and falling back to the LLM. Post-processing converts the raw model
 * output into internal Finding shape and filters to lines within the added
 * ranges (defense-in-depth: models occasionally cite context lines).
 */
export async function detectStringsInFile(
  deps: DetectDeps,
  file: ChangedFile,
  localeIndex: LocaleIndex,
): Promise<DetectFileResult> {
  const context = selectContext(localeIndex, file.repoRelPath, file.addedContent);
  const prompt = buildPrompt(file, localeIndex, context, { recommend: deps.cfg.recommend });

  // The CLI fills the model default before calling runScan; tests pass an
  // explicit value too. Fall back to a sentinel so the cache key is stable.
  const modelId = deps.cfg.model ?? 'default';
  const key = cacheKey({
    // Include the mode in the promptVersion so detect-only and recommend runs
    // don't share cache entries.
    model: modelId,
    promptVersion: `${PROMPT_VERSION}-${deps.cfg.recommend ? 'recommend' : 'detect'}`,
    filePath: file.repoRelPath,
    addedContent: file.addedContent,
    contextDigest: context.digest,
    locales: localeIndex.locales,
  });

  const cached = await deps.cache.get<DetectResponse>(key);
  if (cached) {
    deps.logger.debug(`cache hit: ${file.repoRelPath}`);
    return {
      findings: toFindings(cached, file),
      cacheHit: true,
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  deps.logger.debug(`cache miss: ${file.repoRelPath}`);
  const { response, tokensIn, tokensOut } = await deps.llm.detect({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    model: modelId,
  });
  await deps.cache.set(key, response);

  return {
    findings: toFindings(response, file),
    cacheHit: false,
    tokensIn,
    tokensOut,
  };
}

function toFindings(resp: DetectResponse, file: ChangedFile): Finding[] {
  const out: Finding[] = [];
  const sourceLineByLine = indexSourceLines(file.addedContent);
  for (const raw of resp.findings) {
    if (!isLineInAddedRanges(raw.line, file.addedRanges)) continue;
    out.push(rawToFinding(raw, file, sourceLineByLine.get(raw.line) ?? ''));
  }
  out.sort((a, b) => (a.line - b.line) || a.stringLiteral.localeCompare(b.stringLiteral));
  return out;
}

function indexSourceLines(addedContent: string): Map<number, string> {
  // addedContent lines are formatted as "<postLine>\t<source>"
  const out = new Map<number, string>();
  for (const row of addedContent.split('\n')) {
    const tab = row.indexOf('\t');
    if (tab <= 0) continue;
    const lineStr = row.slice(0, tab);
    const body = row.slice(tab + 1);
    const n = parseInt(lineStr, 10);
    if (Number.isFinite(n)) out.set(n, body);
  }
  return out;
}

function rawToFinding(raw: RawFinding, file: ChangedFile, sourceLine: string): Finding {
  const f: Finding = {
    file: file.repoRelPath,
    line: raw.line,
    platform: file.platform,
    stringLiteral: raw.string_literal,
    sourceLine: sourceLine.trim(),
    isUserFacing: raw.is_user_facing,
    rationale: raw.rationale,
    suggestedKey: raw.suggested_key,
    translations: raw.translations,
  };
  if (raw.duplicate_of_key !== undefined) {
    f.duplicateOfKey = raw.duplicate_of_key;
  }
  return f;
}

function isLineInAddedRanges(line: number, ranges: ChangedFile['addedRanges']): boolean {
  for (const r of ranges) {
    if (line >= r.startLine && line <= r.endLine) return true;
  }
  return false;
}
