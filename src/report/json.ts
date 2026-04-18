import type { ScanResult } from '../types.js';

export function renderJson(result: ScanResult): string {
  // Produce a stable, machine-readable shape. JSON.stringify with indent=2 for diffability.
  return JSON.stringify(result, null, 2);
}
