import { describe, expect, it } from 'vitest';
import { resolveProvider } from '../../src/llm/client.js';

describe('resolveProvider', () => {
  it('respects explicit anthropic when key exists', () => {
    const r = resolveProvider({ explicitProvider: 'anthropic', anthropicKey: 'a', openaiKey: 'b' });
    expect('error' in r).toBe(false);
    expect(r).toEqual({ provider: 'anthropic', apiKey: 'a' });
  });

  it('errors when explicit anthropic but key missing', () => {
    const r = resolveProvider({ explicitProvider: 'anthropic', anthropicKey: undefined, openaiKey: 'b' });
    expect('error' in r).toBe(true);
  });

  it('respects explicit openai when key exists', () => {
    const r = resolveProvider({ explicitProvider: 'openai', anthropicKey: 'a', openaiKey: 'b' });
    expect(r).toEqual({ provider: 'openai', apiKey: 'b' });
  });

  it('auto-detects anthropic first when both keys present and no explicit choice', () => {
    const r = resolveProvider({ explicitProvider: undefined, anthropicKey: 'a', openaiKey: 'b' });
    expect(r).toEqual({ provider: 'anthropic', apiKey: 'a' });
  });

  it('falls back to openai when only OPENAI_API_KEY is set', () => {
    const r = resolveProvider({ explicitProvider: undefined, anthropicKey: undefined, openaiKey: 'b' });
    expect(r).toEqual({ provider: 'openai', apiKey: 'b' });
  });

  it('errors when no key is available', () => {
    const r = resolveProvider({ explicitProvider: undefined, anthropicKey: undefined, openaiKey: undefined });
    expect('error' in r).toBe(true);
  });
});
