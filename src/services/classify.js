// src/services/classify.js
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Klasyfikuj wiadomość użytkownika (haiku — tani i szybki)
async function classifyMessage(text) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: `Sklasyfikuj tę wiadomość jako jedno z: pytanie-ogolne, pytanie-techniczne, small-talk, spam. Odpowiedz JEDNYM słowem.\n\nWiadomość: "${text}"`,
    }],
  });
  return response.content[0].text.trim().toLowerCase();
}

module.exports = { classifyMessage };
