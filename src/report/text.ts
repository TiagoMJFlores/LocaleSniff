import type { Finding, ScanResult } from '../types.js';

export function renderText(result: ScanResult): string {
  const lines: string[] = [];
  lines.push('LocaleSniff report');
  lines.push('==================');

  if (result.findings.length === 0) {
    lines.push('No findings.');
  } else {
    const byFile = new Map<string, Finding[]>();
    for (const f of result.findings) {
      const arr = byFile.get(f.file) ?? [];
      arr.push(f);
      byFile.set(f.file, arr);
    }
    for (const [file, findings] of byFile) {
      lines.push('');
      lines.push(`## ${file}`);
      for (const f of findings) {
        const marker = f.isUserFacing ? 'USER-FACING' : 'technical';
        lines.push(`  ${file}:${f.line}  [${marker}]  ${JSON.stringify(f.stringLiteral)}`);
        if (f.isUserFacing) {
          if (f.duplicateOfKey) {
            lines.push(`    → duplicate of: ${f.duplicateOfKey}`);
          }
          lines.push(`    → suggested key: ${f.suggestedKey}`);
          for (const [locale, value] of Object.entries(f.translations)) {
            lines.push(`      ${locale}: ${JSON.stringify(value)}`);
          }
        }
        if (f.rationale) lines.push(`    (${f.rationale})`);
      }
    }
  }

  if (result.skipped.length > 0) {
    lines.push('');
    lines.push('Skipped:');
    for (const s of result.skipped) {
      lines.push(`  ${s.file}: ${s.reason}`);
    }
  }

  const s = result.stats;
  lines.push('');
  lines.push(
    `Stats — files: ${s.filesScanned}, cache hits: ${s.cacheHits}, LLM calls: ${s.llmCalls}, tokens in/out: ${s.tokensIn}/${s.tokensOut}, time: ${s.ms}ms`,
  );

  return lines.join('\n');
}
