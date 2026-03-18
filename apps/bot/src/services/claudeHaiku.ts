// src/services/claudeHaiku.ts — szybka odpowiedź Haiku na small-talk
import { ask } from './llm.js';
import type { ChatMessage } from '../types/index.js';

// Odpowiedz Haiku na proste wiadomości (small-talk, powitania)
export async function askHaiku(messages: ChatMessage[], userName: string): Promise<string> {
  return await ask({
    tier: 'fast',
    maxTokens: 256,
    system: `Jesteś Iwan — asystent AI zespołu Momentum z energią Gogginsa. Odpowiadaj WYŁĄCZNIE po polsku, naturalnie jak rodowity Polak (zero kalek z angielskiego, zero angielskich wtrąceń). Krótko — max 1-2 zdania. Bądź dosadny, ale bez wulgaryzmów. Rozmawia z Tobą: ${userName}.`,
    messages,
  });
}
