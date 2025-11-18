// Trakt.tv API type definitions

export interface TraktConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiVersion: string;
  apiBaseUrl: string;
}

export interface TraktShow {
  title: string;
  year?: number;
  ids: {
    trakt: number;
    slug: string;
    tvdb?: number;
    imdb?: string;
    tmdb?: number;
  };
}

export interface TraktMovie {
  title: string;
  year?: number;
  ids: {
    trakt: number;
    slug: string;
    imdb?: string;
    tmdb?: number;
  };
}

export interface TraktEpisode {
  season: number;
  number: number;
  title: string;
  ids: {
    trakt: number;
    tvdb?: number;
    imdb?: string;
    tmdb?: number;
  };
}

export interface TraktWatchedItem {
  watched_at: string;
  action: string;
  type: string;
  episode?: TraktEpisode;
  show?: TraktShow;
  movie?: TraktMovie;
}

export type ContentType = 'show' | 'movie';
export type Privacy = 'public' | 'private';
