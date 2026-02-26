// src/crawler/saveMessage.js
const { supabase } = require('../services/supabase');

// Zapisz nową wiadomość z kanału Slack do bazy
async function saveSlackMessage(event) {
  // Ignoruj boty i wiadomości bez tekstu
  if (event.bot_id || !event.text) return;

  const { error } = await supabase
    .from('slack_messages')
    .upsert({
      channel_id: event.channel,
      user_id: event.user,
      user_name: event.user_name || null,
      message_text: event.text,
      thread_ts: event.thread_ts || null,
      message_ts: event.ts,
    }, { onConflict: 'message_ts' });

  if (error) console.error('Błąd zapisu wiadomości:', error.message);
}

module.exports = { saveSlackMessage };
