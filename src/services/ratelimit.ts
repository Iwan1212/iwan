// src/services/ratelimit.js

const limits = new Map();
const MAX_PER_MINUTE = 10;

// Sprawdź czy user nie przekroczył limitu wiadomości
function checkRateLimit(userId) {
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

module.exports = { checkRateLimit };
