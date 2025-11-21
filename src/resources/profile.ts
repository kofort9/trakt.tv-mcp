import { TraktClient } from '../lib/trakt-client.js';

export const PROFILE_RESOURCE = {
  uri: 'trakt://profile',
  name: 'User Profile',
  description: 'Current user profile information',
  mimeType: 'application/json',
};

export async function getProfile(client: TraktClient) {
  const settings = await client.getUserSettings();
  return JSON.stringify(settings.user, null, 2);
}
