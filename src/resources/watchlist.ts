import { TraktClient } from '../lib/trakt-client.js';

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

export async function getWatchlist(client: TraktClient, uri: string) {
  if (uri === 'trakt://watchlist/shows') {
    const items = await client.getWatchlist('shows');
    return JSON.stringify(items, null, 2);
  }
  if (uri === 'trakt://watchlist/movies') {
    const items = await client.getWatchlist('movies');
    return JSON.stringify(items, null, 2);
  }
  throw new Error(`Unknown watchlist URI: ${uri}`);
}
