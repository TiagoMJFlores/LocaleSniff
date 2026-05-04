import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { DetectResponseSchema, type DetectResponse } from './schema.js';

export type Provider = 'anthropic' | 'openai';

export interface DetectInput {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}

export interface DetectOutput {
  response: DetectResponse;
  tokensIn: number;
  tokensOut: number;
}

export interface LlmClient {
  detect(input: DetectInput): Promise<DetectOutput>;
}

export interface ClientConfig {
  provider: Provider;
  apiKey: string;
}

export function makeLlmClient(cfg: ClientConfig): LlmClient {
  if (cfg.provider === 'openai') {
    const openai = createOpenAI({ apiKey: cfg.apiKey });
    return makeClient((modelId) => openai(modelId));
  }
  const anthropic = createAnthropic({ apiKey: cfg.apiKey });
  return makeClient((modelId) => anthropic(modelId));
}

type ModelFactory = (modelId: string) => Parameters<typeof generateObject>[0]['model'];

function makeClient(modelFactory: ModelFactory): LlmClient {
  return {
    async detect(input) {
      const result = await generateObject({
        model: modelFactory(input.model),
        schema: DetectResponseSchema,
        system: input.systemPrompt,
        prompt: input.userPrompt,
        temperature: 0,
      });
      return {
        response: result.object,
        tokensIn: result.usage?.inputTokens ?? 0,
        tokensOut: result.usage?.outputTokens ?? 0,
      };
    },
  };
}

/**
 * Pick a provider given explicit user choice + available env vars.
 * Priority: explicit --provider flag → ANTHROPIC_API_KEY → OPENAI_API_KEY.
 */
export function resolveProvider(args: {
  explicitProvider: Provider | undefined;
  anthropicKey: string | undefined;
  openaiKey: string | undefined;
}): { provider: Provider; apiKey: string } | { error: string } {
  const { explicitProvider, anthropicKey, openaiKey } = args;
  if (explicitProvider === 'anthropic') {
    if (!anthropicKey) return { error: 'Provider is anthropic but ANTHROPIC_API_KEY is not set.' };
    return { provider: 'anthropic', apiKey: anthropicKey };
  }
  if (explicitProvider === 'openai') {
    if (!openaiKey) return { error: 'Provider is openai but OPENAI_API_KEY is not set.' };
    return { provider: 'openai', apiKey: openaiKey };
  }
  if (anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey };
  if (openaiKey) return { provider: 'openai', apiKey: openaiKey };
  return { error: 'No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY (or pass --provider explicitly).' };
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
};
