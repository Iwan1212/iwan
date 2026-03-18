// src/services/channels.ts

import { logError } from './errors.js';
import { getCache, setCache, CACHE_TTL } from './cache.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const channelCache = new Map<string, string>();

// Pobierz nazwę kanału (L1: Map → L2: Redis → L3: Slack API)
export async function getChannelName(app: SlackApp, channelId: string): Promise<string> {
  // L1: in-memory Map
  if (channelCache.has(channelId)) return channelCache.get(channelId)!;

  // L2: Redis
  const cached = await getCache<string>(`slack:channel:${channelId}`);
  if (cached) {
    channelCache.set(channelId, cached);
    return cached;
  }

  // L3: Slack API
  try {
    const result = await app.client.conversations.info({ channel: channelId });
    const name = result.channel.name || channelId;
    channelCache.set(channelId, name);
    await setCache(`slack:channel:${channelId}`, name, CACHE_TTL.CHANNEL_NAME);
    return name;
  } catch (error) {
    logError('channels', 'Błąd pobierania channel info', (error as Error).message);
    return channelId;
  }
}
