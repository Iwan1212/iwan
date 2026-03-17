// src/proactive/proactiveRatelimit.ts — globalny rate limit proaktywnych odpowiedzi
import { getProactiveConfig } from './config.js';

// Lista timestampów odpowiedzi proaktywnych
const timestamps: number[] = [];

// Sprawdź czy limit globalny nie został przekroczony
export function checkProactiveRateLimit(): { allowed: boolean; count: number } {
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
export function recordProactiveResponse(): void {
  timestamps.push(Date.now());
}

// Eksportuj do testów
export function _getTimestamps(): number[] {
  return timestamps;
}
