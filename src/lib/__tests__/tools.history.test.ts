import { describe, it, expect, vi } from 'vitest';
import { logWatch, bulkLog } from '../tools.js';
import type { TraktClient } from '../trakt-client.js';

const makeShowSearchResult = (traktId: number) => [
  {
    type: 'show',
    show: {
      title: 'Test Show',
      year: 2024,
      ids: { trakt: traktId, slug: 'test-show' },
    },
  },
];

describe('history tools payloads', () => {
  it('logWatch uses shows payload for episodes', async () => {
    const addToHistory = vi.fn().mockResolvedValue({ ok: true });
    const mockClient = {
      search: vi.fn().mockResolvedValue(makeShowSearchResult(123)),
      addToHistory,
    } as unknown as TraktClient;

    const watchedAt = '2024-01-01T00:00:00.000Z';
    const result = await logWatch(mockClient, {
      type: 'episode',
      showName: 'Test Show',
      season: 1,
      episode: 2,
      watchedAt,
    });

    expect(result.success).toBe(true);
    expect(addToHistory).toHaveBeenCalledWith(
      {
        shows: [
          {
            watched_at: watchedAt,
            ids: { trakt: 123 },
            seasons: [
              {
                number: 1,
                episodes: [{ number: 2 }],
              },
            ],
          },
        ],
      },
      { toolName: 'log_watch' }
    );
  });

  it('bulkLog uses shows payload for episode ranges', async () => {
    const addToHistory = vi.fn().mockResolvedValue({ ok: true });
    const mockClient = {
      search: vi.fn().mockResolvedValue(makeShowSearchResult(456)),
      addToHistory,
    } as unknown as TraktClient;

    const watchedAt = '2024-02-02T00:00:00.000Z';
    const result = await bulkLog(mockClient, {
      type: 'episodes',
      showName: 'Test Show',
      season: 3,
      episodes: '1-3',
      watchedAt,
    });

    expect(result.success).toBe(true);
    expect(addToHistory).toHaveBeenCalledWith(
      {
        shows: [
          {
            watched_at: watchedAt,
            ids: { trakt: 456 },
            seasons: [
              {
                number: 3,
                episodes: [{ number: 1 }, { number: 2 }, { number: 3 }],
              },
            ],
          },
        ],
      },
      { toolName: 'bulk_log' }
    );
  });
});
