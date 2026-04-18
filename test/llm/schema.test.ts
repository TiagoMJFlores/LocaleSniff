import { describe, expect, it } from 'vitest';
import { DetectResponseSchema } from '../../src/llm/schema.js';

describe('DetectResponseSchema', () => {
  it('accepts a valid response', () => {
    const valid = {
      findings: [
        {
          line: 42,
          string_literal: 'Welcome back!',
          is_user_facing: true,
          rationale: 'Shown to users in SwiftUI Text',
          suggested_key: 'login.welcome_back',
          translations: { en: 'Welcome back!', pt: 'Bem-vindo de volta!' },
        },
      ],
    };
    const r = DetectResponseSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('rejects invalid suggested_key patterns', () => {
    const invalid = {
      findings: [
        {
          line: 1,
          string_literal: 'x',
          is_user_facing: true,
          rationale: 'r',
          suggested_key: 'InvalidCamelCase',
          translations: {},
        },
      ],
    };
    expect(DetectResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects non-positive line numbers', () => {
    const invalid = {
      findings: [
        {
          line: 0,
          string_literal: 'x',
          is_user_facing: false,
          rationale: 'r',
          suggested_key: 'a',
          translations: {},
        },
      ],
    };
    expect(DetectResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts empty findings', () => {
    expect(DetectResponseSchema.safeParse({ findings: [] }).success).toBe(true);
  });
});
