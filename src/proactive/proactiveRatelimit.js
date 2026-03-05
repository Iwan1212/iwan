// src/proactive/proactiveRatelimit.js — globalny rate limit proaktywnych odpowiedzi
const { getProactiveConfig } = require('./config');

// Lista timestampów odpowiedzi proaktywnych
const timestamps = [];

// Sprawdź czy limit globalny nie został przekroczony
function checkProactiveRateLimit() {
  const config = getProactiveConfig();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  // Wyczyść stare wpisy
  while (timestamps.length > 0 && timestamps[0] < oneHourAgo) {
    timestamps.shift();
  }

  return {
    allowed: timestamps.length < config.globalMaxPerHour,
    count: timestamps.length,
  };
}

// Zapisz timestamp odpowiedzi proaktywnej
function recordProactiveResponse() {
  timestamps.push(Date.now());
}

// Eksportuj do testów
function _getTimestamps() {
  return timestamps;
}

module.exports = { checkProactiveRateLimit, recordProactiveResponse, _getTimestamps };
