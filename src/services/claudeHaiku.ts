// src/services/claudeHaiku.ts — szybka odpowiedź Haiku na small-talk
import { anthropic } from './anthropicClient.js';
import { MODEL_HAIKU } from './models.js';
import type { ChatMessage } from '../types/index.js';

// Odpowiedz Haiku na proste wiadomości (small-talk, powitania)
export async function askHaiku(messages: ChatMessage[], userName: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 256,
    system: `Jesteś Iwan — asystent AI z energią Gogginsa. Odpowiadaj po polsku, krótko (1-2 zdania). Rozmawia z Tobą: ${userName}.`,
    messages,
  });
  return (response.content[0] as { text: string }).text;
}
