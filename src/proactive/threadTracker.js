// src/proactive/threadTracker.js — licznik wiadomości w wątkach (in-memory)
const { getProactiveConfig } = require('./config');

// Map: "channelId:threadTs" → { count, respondedAt }
const threads = new Map();

// Śledź wiadomość w wątku, zwraca { triggered } gdy osiągnięto threshold
function trackThreadMessage(channelId, threadTs) {
  if (!threadTs) return { triggered: false };

  const key = `${channelId}:${threadTs}`;
  const entry = threads.get(key) || { count: 0, respondedAt: null };
  entry.count++;
  threads.set(key, entry);

  const config = getProactiveConfig();

  // Sprawdź cooldown
  if (entry.respondedAt) {
    const cooldownMs = config.threadCooldownMinutes * 60 * 1000;
    if (Date.now() - entry.respondedAt < cooldownMs) {
      return { triggered: false };
    }
  }

  return { triggered: entry.count >= config.threadThreshold };
}

// Oznacz wątek jako obsłużony — ustaw cooldown i resetuj licznik
function markThreadResponded(channelId, threadTs) {
  const key = `${channelId}:${threadTs}`;
  const entry = threads.get(key) || { count: 0 };
  entry.count = 0;
  entry.respondedAt = Date.now();
  threads.set(key, entry);
}

// Wyczyść wpisy starsze niż 24h
function cleanupThreads() {
  const maxAge = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, entry] of threads) {
    const ts = parseFloat(key.split(':')[1]) * 1000;
    if (now - ts > maxAge) {
      threads.delete(key);
    }
  }
}

// Eksportuj map do testów
function _getThreads() {
  return threads;
}

module.exports = { trackThreadMessage, markThreadResponded, cleanupThreads, _getThreads };
