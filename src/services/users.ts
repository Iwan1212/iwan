// src/services/users.ts

import { logError } from './errors.js';
import type { SearchResult } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const userCache = new Map<string, string>();

// Pobierz nazwę użytkownika z Slack API (z cache)
export async function getUserName(app: SlackApp, userId: string): Promise<string> {
  if (userCache.has(userId)) return userCache.get(userId)!;

  try {
    const result = await app.client.users.info({ user: userId });
    const name = result.user.real_name || result.user.name || userId;
    userCache.set(userId, name);
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
