// src/proactive/setup.ts — inicjalizacja trybu proaktywnego
import { isProactiveEnabled } from './config.js';
import { resolveProactiveChannels } from './channelResolver.js';
import { cleanupThreads } from './threadTracker.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Inicjalizuj tryb proaktywny przy starcie
export async function setupProactive(app: SlackApp): Promise<void> {
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
