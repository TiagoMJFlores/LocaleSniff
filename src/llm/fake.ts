import type { LlmClient, DetectInput, DetectOutput } from './client.js';
import type { DetectResponse } from './schema.js';

export interface FakeScript {
  /** Called for each detect() call; whatever it returns becomes the response. */
  respond(input: DetectInput): DetectResponse;
}

export function makeFakeClient(script: FakeScript): LlmClient & { callCount: number } {
  const c = {
    callCount: 0,
    async detect(input: DetectInput): Promise<DetectOutput> {
      c.callCount += 1;
      return {
        response: script.respond(input),
        tokensIn: 100,
        tokensOut: 50,
      };
    },
  };
  return c;
}
