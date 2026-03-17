// src/proactive/threadTracker.ts — licznik wiadomości w wątkach (in-memory)
import { getProactiveConfig } from './config.js';

interface ThreadEntry {
  count: number;
  respondedAt: number | null;
}

// Map: "channelId:threadTs" → { count, respondedAt }
const threads = new Map<string, ThreadEntry>();

// Śledź wiadomość w wątku, zwraca { triggered } gdy osiągnięto threshold
export function trackThreadMessage(channelId: string, threadTs: string): { triggered: boolean } {
  if (!threadTs) return { triggered: false };

  const key = `${channelId}:${threadTs}`;
  const entry = threads.get(key) || { count: 0, respondedAt: null };
  entry.count++;
  threads.set(key, entry);

  const config = getProactiveConfig();

  // Sprawdź cooldown
  if (entry.respondedAt) {
    const cooldownMs = config.threadCooldownMinutes * 60 * 1000;
    if (Date.now() - entry.respondedAt < cooldownMs) {
      return { triggered: false };
    }
  }

  return { triggered: entry.count >= config.threadThreshold };
}

// Oznacz wątek jako obsłużony — ustaw cooldown i resetuj licznik
export function markThreadResponded(channelId: string, threadTs: string): void {
  const key = `${channelId}:${threadTs}`;
  const entry = threads.get(key) || { count: 0, respondedAt: null };
  entry.count = 0;
  entry.respondedAt = Date.now();
  threads.set(key, entry);
}

// Wyczyść wpisy starsze niż 24h
export function cleanupThreads(): void {
  const maxAge = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, _entry] of threads) {
    const ts = parseFloat(key.split(':')[1]) * 1000;
    if (now - ts > maxAge) {
      threads.delete(key);
    }
  }
}

// Eksportuj map do testów
export function _getThreads(): Map<string, ThreadEntry> {
  return threads;
}
