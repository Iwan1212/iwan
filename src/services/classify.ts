// src/services/classify.ts
import { anthropic } from './anthropicClient.js';
import { MODEL_HAIKU } from './models.js';

// Klasyfikuj wiadomość użytkownika (haiku — tani i szybki)
export async function classifyMessage(text: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `Sklasyfikuj tę wiadomość jako jedno z: pytanie-ogolne, pytanie-techniczne, small-talk, spam. Odpowiedz JEDNYM słowem.\n\nWiadomość: "${text}"`,
    }],
  });
  return (response.content[0] as { text: string }).text.trim().toLowerCase();
}
