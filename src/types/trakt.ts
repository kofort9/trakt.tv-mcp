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

export interface TraktSearchResult {
  type: string;
  score: number;
  show?: TraktShow;
  movie?: TraktMovie;
  episode?: TraktEpisode;
}

export interface TraktHistoryAddResponse {
  added: {
    episodes: number;
    movies: number;
  };
  not_found: {
    movies: unknown[];
    shows: unknown[];
    seasons: unknown[];
    episodes: unknown[];
  };
}

export interface TraktCalendarItem {
  first_aired: string;
  episode: TraktEpisode;
  show: TraktShow;
}

export interface TraktWatchlistItem {
  rank: number;
  listed_at: string;
  type: string;
  show?: TraktShow;
  movie?: TraktMovie;
}

export interface TraktHistorySummary {
  total_watched: number;
  unique_shows: number;
  unique_movies: number;
  total_episodes: number;
  most_watched_show?: {
    show: TraktShow;
    episodes_watched: number;
  };
  recent_activity: {
    last_24h: number;
    last_week: number;
    last_month: number;
  };
}

export type ContentType = 'show' | 'movie';
export type Privacy = 'public' | 'private';

// Disambiguation types for human approval flow
export interface DisambiguationOption {
  title: string;
  year?: number;
  traktId: number;
  type: 'show' | 'movie';
}

export interface DisambiguationResponse {
  success: false;
  needs_disambiguation: true;
  options: DisambiguationOption[];
  message: string;
}

// OAuth types
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

export interface StoredToken extends TokenResponse {
  expires_at: number;
}
