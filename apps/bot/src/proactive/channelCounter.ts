// src/proactive/channelCounter.ts — licznik wiadomości na kanale (in-memory)
import { getProactiveConfig } from './config.js';

interface ChannelEntry {
  count: number;
  respondedAt: number | null;
}

// Map: channelId → { count, respondedAt }
const channels = new Map<string, ChannelEntry>();

// Śledź wiadomość na kanale, zwraca { triggered } co N wiadomości
export function trackChannelMessage(channelId: string): { triggered: boolean } {
  const entry = channels.get(channelId) || { count: 0, respondedAt: null };
  entry.count++;
  channels.set(channelId, entry);

  const config = getProactiveConfig();

  // Sprawdź cooldown
  if (entry.respondedAt) {
    const cooldownMs = config.channelCooldownMinutes * 60 * 1000;
    if (Date.now() - entry.respondedAt < cooldownMs) {
      return { triggered: false };
    }
  }

  return { triggered: entry.count >= config.channelMessageInterval };
}

// Oznacz kanał jako obsłużony — reset + cooldown
export function markChannelResponded(channelId: string): void {
  const entry = channels.get(channelId) || { count: 0, respondedAt: null };
  entry.count = 0;
  entry.respondedAt = Date.now();
  channels.set(channelId, entry);
}

// Eksportuj map do testów
export function _getChannels(): Map<string, ChannelEntry> {
  return channels;
}
