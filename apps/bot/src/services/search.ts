// src/services/search.ts
import { supabase } from './supabase.js';
import { logError } from './errors.js';
import type { SearchResult } from '../types/index.js';

// Wyszukaj wiadomości w historii Slack (full-text search, tylko z danego kanału)
export async function searchSlackHistory(query: string, channelId: string, excludeThreadTs: string | null = null): Promise<SearchResult[]> {
  const { data, error } = await supabase
    .rpc('search_slack_messages', {
      search_query: query,
      search_channel_id: channelId,
      result_limit: 10,
    });

  if (error) {
    logError('search', 'Błąd wyszukiwania', error.message);
    return [];
  }

  // Filtruj wiadomości z bieżącego wątku (unikaj halucynacji o "historii")
  let results = (data || []) as SearchResult[];
  if (excludeThreadTs) {
    results = results.filter(msg => msg.thread_ts !== excludeThreadTs);
  }
  return results;
}

// Zbuduj kontekst z wyników wyszukiwania
export function buildContextFromMessages(messages: SearchResult[]): string {
  if (messages.length === 0) return '';

  const context = messages.map(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('pl-PL');
    return `[${date}] ${msg.user_name || msg.user_id}: ${msg.message_text}`;
  }).join('\n');

  return `\n\nKONTEKST Z HISTORII SLACK (znalezione wiadomości z tego kanału):\n---\n${context}\n---\n`;
}
