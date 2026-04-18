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

// JSON schema for Claude tool use (kept in sync with the zod schema above).
// Hand-maintained because we only have one tool; update both together.
export const REPORT_FINDINGS_TOOL = {
  name: 'report_findings',
  description:
    'Report every hardcoded string literal you detected in the diff. Classify each as user-facing or technical. For user-facing ones, propose a snake.dot.case key and a translated value for every locale provided.',
  input_schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            line: { type: 'number', description: 'Post-image line number where the string appears.' },
            string_literal: { type: 'string' },
            is_user_facing: { type: 'boolean' },
            rationale: { type: 'string' },
            suggested_key: { type: 'string', pattern: '^[a-z0-9_.]+$' },
            duplicate_of_key: { type: 'string' },
            translations: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
          required: ['line', 'string_literal', 'is_user_facing', 'rationale', 'suggested_key', 'translations'],
        },
      },
      notes: { type: 'string' },
    },
    required: ['findings'],
  },
} as const;

export const PROMPT_VERSION = 'v4';
