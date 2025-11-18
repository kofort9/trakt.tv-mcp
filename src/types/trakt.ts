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
