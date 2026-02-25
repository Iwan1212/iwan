// src/services/memory.js
const { supabase } = require('./supabase');

// Zapisz wiadomość w historii rozmowy
async function saveMessage(channelId, threadTs, userId, role, content) {
  const { error } = await supabase
    .from('conversations')
    .insert({
      channel_id: channelId,
      thread_ts: threadTs || null,
      user_id: userId,
      role: role,
      content: content,
    });
  if (error) console.error('Błąd zapisu wiadomości:', error.message);
}

// Pobierz historię rozmowy z danego threadu
async function getHistory(channelId, threadTs, limit = 10) {
  const { data, error } = await supabase
    .from('conversations')
    .select('role, content')
    .eq('channel_id', channelId)
    .eq('thread_ts', threadTs || 'main')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Błąd pobierania historii:', error.message);
    return [];
  }
  return data || [];
}

module.exports = { saveMessage, getHistory };
