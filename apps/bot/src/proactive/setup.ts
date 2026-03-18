// src/proactive/setup.ts — inicjalizacja trybu proaktywnego
import { isProactiveEnabled } from './config.js';
import { resolveProactiveChannels } from './channelResolver.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Inicjalizuj tryb proaktywny przy starcie (cleanup przeniesiony do scheduler.ts)
export async function setupProactive(app: SlackApp): Promise<void> {
  if (!isProactiveEnabled()) {
    console.log('[proactive] Tryb proaktywny wyłączony (ENABLE_PROACTIVE !== true)');
    return;
  }

  // Rozwiąż nazwy kanałów na ID
  await resolveProactiveChannels(app);

  console.log('[proactive] Tryb proaktywny aktywny');
}
