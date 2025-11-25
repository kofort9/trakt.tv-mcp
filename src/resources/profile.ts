import { TraktClient } from '../lib/trakt-client.js';

export const PROFILE_RESOURCE = {
  uri: 'trakt://profile',
  name: 'User Profile',
  description: 'Current user profile information',
  mimeType: 'application/json',
};

export async function getProfile(client: TraktClient) {
  const settings = await client.getUserSettings();

  const response = {
    metadata: {
      type: 'profile',
      description: 'Current user profile and settings',
      username: settings.user.username,
    },
    data: settings.user,
  };

  return JSON.stringify(response, null, 2);
}
