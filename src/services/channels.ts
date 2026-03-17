// src/services/channels.ts

import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const channelCache = new Map<string, string>();

// Pobierz nazwę kanału z Slack API (z cache)
export async function getChannelName(app: SlackApp, channelId: string): Promise<string> {
  if (channelCache.has(channelId)) return channelCache.get(channelId)!;

  try {
    const result = await app.client.conversations.info({ channel: channelId });
    const name = result.channel.name || channelId;
    channelCache.set(channelId, name);
    return name;
  } catch (error) {
    logError('channels', 'Błąd pobierania channel info', (error as Error).message);
    return channelId;
  }
}
