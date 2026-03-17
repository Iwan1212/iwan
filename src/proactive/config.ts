// src/proactive/config.js — konfiguracja trybu proaktywnego z env vars

// Sprawdź czy tryb proaktywny jest włączony
function isProactiveEnabled() {
  return process.env.ENABLE_PROACTIVE === 'true';
}

// Parsuj nazwy kanałów z env var (comma-separated)
function getProactiveChannelNames() {
  const raw = process.env.PROACTIVE_CHANNELS || '';
  if (!raw.trim()) return [];
  return raw.split(',').map(ch => ch.trim()).filter(Boolean);
}

// Zwróć pełną konfigurację z defaultami
function getProactiveConfig() {
  return {
    threadThreshold: parseInt(process.env.PROACTIVE_THREAD_THRESHOLD, 10) || 5,
    channelMessageInterval: parseInt(process.env.PROACTIVE_CHANNEL_MESSAGE_INTERVAL, 10) || 15,
    confidenceThreshold: parseFloat(process.env.PROACTIVE_CONFIDENCE_THRESHOLD) || 0.7,
    globalMaxPerHour: parseInt(process.env.PROACTIVE_GLOBAL_MAX_PER_HOUR, 10) || 10,
    threadCooldownMinutes: parseInt(process.env.PROACTIVE_THREAD_COOLDOWN_MINUTES, 10) || 60,
    channelCooldownMinutes: parseInt(process.env.PROACTIVE_CHANNEL_COOLDOWN_MINUTES, 10) || 30,
  };
}

module.exports = { isProactiveEnabled, getProactiveChannelNames, getProactiveConfig };
