import { describe, it, expect } from 'vitest';
import { sanitizeInputArgs, sanitizeOutput } from '../sanitization.js';

describe('sanitization helpers', () => {
  it('sanitizes input args consistently', () => {
    const result = sanitizeInputArgs({
      plain: 'text',
      long: 'a'.repeat(120),
      list: [1, 2, 3],
      nested: { secret: 'value' },
      nothing: null,
    });

    expect(result).toEqual({
      plain: 'text',
      long: 'a'.repeat(100) + '...[truncated]',
      list: { type: 'array', length: 3 },
      nested: { type: 'object', keys: ['secret'] },
      nothing: null,
    });
  });

  it('sanitizes outputs consistently', () => {
    expect(sanitizeOutput('a'.repeat(510))).toBe('a'.repeat(500) + '...[truncated]');
    expect(sanitizeOutput([1, 2, 3, 4])).toEqual({ type: 'array', length: 4, sample: [1, 2, 3] });
    expect(sanitizeOutput({ success: true, data: { id: 1 }, message: 'ok' })).toEqual({
      success: true,
      has_data: true,
      message: 'ok',
    });
    expect(sanitizeOutput({ content: [{}, {}] })).toEqual({
      type: 'mcp_response',
      content_count: 2,
    });
  });
});
