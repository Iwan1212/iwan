// src/proactive/setup.js — inicjalizacja trybu proaktywnego
const { isProactiveEnabled } = require('./config');
const { resolveProactiveChannels } = require('./channelResolver');
const { cleanupThreads } = require('./threadTracker');

// Inicjalizuj tryb proaktywny przy starcie
async function setupProactive(app) {
  if (!isProactiveEnabled()) {
    console.log('[proactive] Tryb proaktywny wyłączony (ENABLE_PROACTIVE !== true)');
    return;
  }

  // Rozwiąż nazwy kanałów na ID
  await resolveProactiveChannels(app);

  // Cleanup starych wątków co godzinę
  setInterval(cleanupThreads, 60 * 60 * 1000);

  console.log('[proactive] Tryb proaktywny aktywny');
}

module.exports = { setupProactive };
