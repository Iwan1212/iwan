// src/proactive/channelResolver.ts — resolving nazw kanałów na ID
import { getProactiveChannelNames } from './config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Cache: name → id
let channelMap = new Map<string, string>();

// Rozwiąż nazwy kanałów na ID (raz przy starcie)
export async function resolveProactiveChannels(app: SlackApp): Promise<void> {
  const names = getProactiveChannelNames();
  if (names.length === 0) return;

  try {
    const nameSet = new Set(names);
    let cursor: string | undefined;
    let totalFetched = 0;

    // Paginacja — conversations.list może nie zwrócić wszystkich w jednym batchu
    do {
      const result = await app.client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      });

      const batch = result.channels || [];
      totalFetched += batch.length;

      for (const ch of batch) {
        if (nameSet.has(ch.name)) {
          channelMap.set(ch.name, ch.id);
        }
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor && channelMap.size < names.length);

    console.log(`[proactive] Resolved ${channelMap.size}/${names.length} kanałów (przeszukano ${totalFetched}): ${[...channelMap.entries()].map(([n, id]) => `${n}=${id}`).join(', ')}`);

    // Loguj brakujące kanały
    const missing = names.filter(n => !channelMap.has(n));
    if (missing.length > 0) {
      console.log(`[proactive] Nie znaleziono kanałów: ${missing.join(', ')} — sprawdź czy bot jest memberem`);
    }
  } catch (error) {
    console.error('[proactive] Błąd resolving kanałów:', (error as Error).message);
  }
}

// Sprawdź czy kanał jest proaktywny (po ID)
export function isProactiveChannel(channelId: string): boolean {
  for (const id of channelMap.values()) {
    if (id === channelId) return true;
  }
  return false;
}

// Eksportuj do testów
export function _getChannelMap(): Map<string, string> {
  return channelMap;
}

export function _setChannelMap(map: Map<string, string>): void {
  channelMap = map;
}
