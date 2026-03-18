// src/crawler/saveMessage.ts
import { supabase } from '../services/supabase.js';
import { logError } from '../services/errors.js';

interface SlackEvent {
  bot_id?: string;
  text?: string;
  channel: string;
  user: string;
  user_name?: string | null;
  channel_name?: string | null;
  thread_ts?: string | null;
  ts: string;
}

// Zapisz nową wiadomość z kanału Slack do bazy
export async function saveSlackMessage(event: SlackEvent): Promise<void> {
  // Ignoruj boty i wiadomości bez tekstu
  if (event.bot_id || !event.text) return;

  const { error } = await supabase
    .from('slack_messages')
    .upsert({
      channel_id: event.channel,
      user_id: event.user,
      user_name: event.user_name || null,
      channel_name: event.channel_name || null,
      message_text: event.text,
      thread_ts: event.thread_ts || null,
      message_ts: event.ts,
    }, { onConflict: 'message_ts' });

  if (error) logError('crawler', 'Błąd zapisu wiadomości', error.message);
}
