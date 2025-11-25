import { TraktClient } from '../lib/trakt-client.js';

export const HISTORY_RESOURCES = [
  {
    uri: 'trakt://history/shows/recent',
    name: 'Recent History (Shows)',
    description: 'Recently watched TV shows (last 50 items)',
    mimeType: 'application/json',
  },
  {
    uri: 'trakt://history/movies/recent',
    name: 'Recent History (Movies)',
    description: 'Recently watched movies (last 50 items)',
    mimeType: 'application/json',
  },
];

export async function getHistory(client: TraktClient, uri: string) {
  let type: 'shows' | 'movies';
  if (uri === 'trakt://history/shows/recent') {
    type = 'shows';
  } else if (uri === 'trakt://history/movies/recent') {
    type = 'movies';
  } else {
    throw new Error(`Unknown history URI: ${uri}`);
  }

  const data = await client.getHistory(type, undefined, undefined, 1);

  const response = {
    metadata: {
      type,
      count: Array.isArray(data) ? data.length : 0,
      description: 'Most recent 50 items. Use get_history tool for more.',
    },
    items: data,
  };

  return JSON.stringify(response, null, 2);
}
