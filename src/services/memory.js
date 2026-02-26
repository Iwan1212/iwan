// src/services/memory.js
const { supabase } = require('./supabase');
const { logError } = require('./errors');

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
  if (error) logError('memory', 'Błąd zapisu wiadomości', error.message);
}

// Pobierz historię rozmowy z danego threadu
async function getHistory(channelId, threadTs, limit = 10) {
  let query = supabase
    .from('conversations')
    .select('role, content')
    .eq('channel_id', channelId);

  // Null thread_ts = wiadomości z głównego kanału
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
  return data || [];
}

module.exports = { saveMessage, getHistory };
