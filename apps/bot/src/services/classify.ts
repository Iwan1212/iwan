// src/services/classify.ts
import { ask } from './llm.js';

// Klasyfikuj wiadomość użytkownika (fast tier — tani i szybki)
export async function classifyMessage(text: string): Promise<string> {
  const result = await ask({
    tier: 'fast',
    maxTokens: 50,
    messages: [{
      role: 'user',
      content: `Sklasyfikuj tę wiadomość jako jedno z: pytanie-ogolne, pytanie-techniczne, small-talk, spam. Odpowiedz JEDNYM słowem.\n\nWiadomość: "${text}"`,
    }],
  });
  return result.trim().toLowerCase();
}
