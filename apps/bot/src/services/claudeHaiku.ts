// src/services/claudeHaiku.ts — szybka odpowiedź Haiku na small-talk
import { ask } from './llm.js';
import type { ChatMessage } from '../types/index.js';

// Odpowiedz Haiku na proste wiadomości (small-talk, powitania)
export async function askHaiku(messages: ChatMessage[], userName: string): Promise<string> {
  return await ask({
    tier: 'fast',
    maxTokens: 256,
    system: `Jesteś Iwan — asystent AI z energią Gogginsa. Odpowiadaj po polsku, krótko (1-2 zdania). Rozmawia z Tobą: ${userName}.`,
    messages,
  });
}
