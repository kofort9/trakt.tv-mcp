import { TraktClient } from '../trakt-client.js';

export const WATCHLIST_RESOURCES = [
  {
    uri: 'trakt://watchlist/shows',
    name: 'Watchlist (Shows)',
    description: 'TV shows in your watchlist',
    mimeType: 'application/json',
  },
  {
    uri: 'trakt://watchlist/movies',
    name: 'Watchlist (Movies)',
    description: 'Movies in your watchlist',
    mimeType: 'application/json',
  },
];

export async function getWatchlist(client: TraktClient, uri: string): Promise<string> {
  try {
    let type: 'shows' | 'movies';
    if (uri === 'trakt://watchlist/shows') {
      type = 'shows';
    } else if (uri === 'trakt://watchlist/movies') {
      type = 'movies';
    } else {
      throw new Error(`Unknown watchlist URI: ${uri}`);
    }

    const data = await client.getWatchlist(type);

    const response = {
      metadata: {
        type,
        count: Array.isArray(data) ? data.length : 0,
        description: `${type} in your watchlist`,
      },
      items: data,
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    throw new Error(
      `Failed to fetch watchlist from Trakt API: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
