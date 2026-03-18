// src/services/memory.ts
import { supabase } from './supabase.js';
import { logError } from './errors.js';
import type { ChatMessage } from '../types/index.js';

// Zapisz wiadomość w historii rozmowy
export async function saveMessage(channelId: string, threadTs: string | null, userId: string, role: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .insert({
      channel_id: channelId,
      thread_ts: threadTs || null,
      user_id: userId,
      role: role,
      content: content,
    });
  if (error) logError('memory', 'Błąd zapisu wiadomości', error.message);
}

// Pobierz historię rozmowy z danego threadu
export async function getHistory(channelId: string, threadTs: string | null, limit = 10): Promise<ChatMessage[]> {
  let query = supabase
    .from('conversations')
    .select('role, content')
    .eq('channel_id', channelId);

  if (threadTs) {
    query = query.eq('thread_ts', threadTs);
  } else {
    query = query.is('thread_ts', null);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logError('memory', 'Błąd pobierania historii', error.message);
    return [];
  }
  return (data || []) as ChatMessage[];
}
