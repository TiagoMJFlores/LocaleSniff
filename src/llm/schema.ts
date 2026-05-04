import { z } from 'zod';

export const FindingSchema = z.object({
  line: z.number().int().positive(),
  string_literal: z.string().min(1),
  is_user_facing: z.boolean(),
  rationale: z.string().max(500),
  // Key + translations are allowed to be empty in detect-only mode (no --recommend).
  suggested_key: z.string().regex(/^([a-z0-9_.]+)?$/),
  duplicate_of_key: z.string().optional(),
  translations: z.record(z.string(), z.string()).default({}),
});

export const DetectResponseSchema = z.object({
  findings: z.array(FindingSchema),
  notes: z.string().optional(),
});

export type DetectResponse = z.infer<typeof DetectResponseSchema>;
export type RawFinding = z.infer<typeof FindingSchema>;

export const PROMPT_VERSION = 'v5';
