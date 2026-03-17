// src/proactive/channelCounter.js — licznik wiadomości na kanale (in-memory)
const { getProactiveConfig } = require('./config');

// Map: channelId → { count, respondedAt }
const channels = new Map();

// Śledź wiadomość na kanale, zwraca { triggered } co N wiadomości
function trackChannelMessage(channelId) {
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
function markChannelResponded(channelId) {
  const entry = channels.get(channelId) || {};
  entry.count = 0;
  entry.respondedAt = Date.now();
  channels.set(channelId, entry);
}

// Eksportuj map do testów
function _getChannels() {
  return channels;
}

module.exports = { trackChannelMessage, markChannelResponded, _getChannels };
