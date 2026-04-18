import Anthropic from '@anthropic-ai/sdk';
import { DetectResponseSchema, REPORT_FINDINGS_TOOL, type DetectResponse } from './schema.js';

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

export function makeAnthropicClient(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async detect(input) {
      const res = await client.messages.create({
        model: input.model,
        max_tokens: 4096,
        temperature: 0,
        system: input.systemPrompt,
        tools: [REPORT_FINDINGS_TOOL],
        tool_choice: { type: 'tool', name: 'report_findings' },
        messages: [{ role: 'user', content: input.userPrompt }],
      });

      const toolUse = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use');
      if (!toolUse) {
        throw new Error('Claude did not return a tool_use block.');
      }
      const parsed = DetectResponseSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        throw new Error(
          `Tool input failed schema validation: ${parsed.error.message}`,
        );
      }
      return {
        response: parsed.data,
        tokensIn: res.usage.input_tokens,
        tokensOut: res.usage.output_tokens,
      };
    },
  };
}
