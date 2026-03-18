// src/services/users.ts

import { logError } from './errors.js';
import { getCache, setCache, CACHE_TTL } from './cache.js';
import type { SearchResult } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const userCache = new Map<string, string>();

// Pobierz nazwę użytkownika (L1: Map → L2: Redis → L3: Slack API)
export async function getUserName(app: SlackApp, userId: string): Promise<string> {
  // L1: in-memory Map
  if (userCache.has(userId)) return userCache.get(userId)!;

  // L2: Redis
  const cached = await getCache<string>(`slack:user:${userId}`);
  if (cached) {
    userCache.set(userId, cached);
    return cached;
  }

  // L3: Slack API
  try {
    const result = await app.client.users.info({ user: userId });
    const name = result.user.real_name || result.user.name || userId;
    userCache.set(userId, name);
    await setCache(`slack:user:${userId}`, name, CACHE_TTL.USER_NAME);
    return name;
  } catch (error) {
    logError('users', 'Błąd pobierania user info', (error as Error).message);
    return userId;
  }
}

// Zamień user_id na nazwy w liście wiadomości
export async function resolveUserNames(app: SlackApp, messages: SearchResult[]): Promise<SearchResult[]> {
  for (const msg of messages) {
    if (!msg.user_name && msg.user_id) {
      msg.user_name = await getUserName(app, msg.user_id);
    }
  }
  return messages;
}
