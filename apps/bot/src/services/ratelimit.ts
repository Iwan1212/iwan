// src/services/ratelimit.ts
import type { RateLimitResult } from '../types/index.js';

const limits = new Map<string, number[]>();
const MAX_PER_MINUTE = 10;

// Sprawdź czy user nie przekroczył limitu wiadomości
export function checkRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  const userHistory = limits.get(userId) || [];
  const recent = userHistory.filter(t => now - t < 60000);
  if (recent.length >= MAX_PER_MINUTE) {
    return { allowed: false, error: 'Zbyt wiele wiadomości. Poczekaj minutę.' };
  }
  recent.push(now);
  limits.set(userId, recent);
  return { allowed: true, error: null };
}
