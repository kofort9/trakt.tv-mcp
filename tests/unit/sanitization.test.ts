import { describe, it, expect } from 'vitest';
import { sanitizeInputArgs, sanitizeOutput } from '../../src/core/sanitization.js';

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
      long: 'a'.repeat(86) + '...[truncated]', // 86 chars + 14 char suffix = 100 total
      list: { type: 'array', length: 3, sample: [1, 2] },
      nested: { type: 'object', keys: ['secret'] },
      nothing: null,
    });
  });

  it('sanitizes input arrays with nested data recursively', () => {
    const result = sanitizeInputArgs({
      complexArray: [
        { title: 'Show 1', id: 123 },
        { title: 'Show 2', id: 456 },
        { title: 'Show 3', id: 789 },
      ],
      arrayWithLongStrings: ['a'.repeat(120), 'short', 'another'],
      nestedArrays: [[1, 2, 3], [4, 5], [6]],
    });

    expect(result).toEqual({
      complexArray: {
        type: 'array',
        length: 3,
        sample: [
          { type: 'object', keys: ['title', 'id'] },
          { type: 'object', keys: ['title', 'id'] },
        ],
      },
      arrayWithLongStrings: {
        type: 'array',
        length: 3,
        sample: ['a'.repeat(86) + '...[truncated]', 'short'], // 86 chars + 14 char suffix = 100
      },
      nestedArrays: {
        type: 'array',
        length: 3,
        sample: [
          { type: 'array', length: 3 },
          { type: 'array', length: 2 },
        ],
      },
    });
  });

  it('sanitizes outputs consistently', () => {
    expect(sanitizeOutput('a'.repeat(510))).toBe('a'.repeat(486) + '...[truncated]'); // 486 + 14 = 500
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
