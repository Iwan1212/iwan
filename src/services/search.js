// src/services/search.js
const { supabase } = require('./supabase');
const { logError } = require('./errors');

// Wyszukaj wiadomości w historii Slack (full-text search, tylko z danego kanału)
async function searchSlackHistory(query, channelId) {
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
  return data || [];
}

// Zbuduj kontekst z wyników wyszukiwania
function buildContextFromMessages(messages) {
  if (messages.length === 0) return '';

  const context = messages.map(msg => {
    const date = new Date(msg.created_at).toLocaleDateString('pl-PL');
    return `[${date}] ${msg.user_name || msg.user_id}: ${msg.message_text}`;
  }).join('\n');

  return `\n\nKONTEKST Z HISTORII SLACK (znalezione wiadomości z tego kanału):\n---\n${context}\n---\n`;
}

module.exports = { searchSlackHistory, buildContextFromMessages };
