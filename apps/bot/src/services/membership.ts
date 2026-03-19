// src/services/membership.ts -- Slack membership check z cache w Redis

import { getCache, setCache } from './cache.js';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const MEMBERSHIP_TTL = 300; // 5 minut

// Sprawdz czy user jest czlonkiem kanalu (cache w Redis, TTL 5 min)
export async function isUserInChannel(app: SlackApp, userId: string, channelId: string): Promise<boolean> {
  const cacheKey = `membership:${channelId}:${userId}`;

  // Sprawdz cache
  const cached = await getCache<boolean>(cacheKey);
  if (cached !== null) return cached;

  // Odpytaj Slack API z paginacja
  try {
    let cursor: string | undefined;
    do {
      const result = await app.client.conversations.members({
        channel: channelId,
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });

      const members: string[] = result.members || [];
      if (members.includes(userId)) {
        await setCache(cacheKey, true, MEMBERSHIP_TTL);
        return true;
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    // User nie znaleziony na liscie czlonkow
    await setCache(cacheKey, false, MEMBERSHIP_TTL);
    return false;
  } catch (error) {
    const msg = (error as Error).message || '';
    // Deny by default przy bledach API (np. channel_not_found)
    logError('membership', `Blad sprawdzania membership ${channelId}:${userId}`, msg);
    return false;
  }
}

// Pobierz liste kanalow usera (cache w Redis, TTL 5 min)
export async function getUserChannelIds(app: SlackApp, userId: string): Promise<string[]> {
  const cacheKey = `membership:user-channels:${userId}`;

  const cached = await getCache<string[]>(cacheKey);
  if (cached !== null) return cached;

  try {
    const channels: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await app.client.users.conversations({
        user: userId,
        types: 'public_channel,private_channel',
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });

      for (const ch of result.channels || []) {
        if (ch.id) channels.push(ch.id);
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);

    await setCache(cacheKey, channels, MEMBERSHIP_TTL);
    return channels;
  } catch (error) {
    logError('membership', `Blad pobierania kanalow usera ${userId}`, (error as Error).message);
    return [];
  }
}
