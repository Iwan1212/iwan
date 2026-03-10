// src/services/claudeHaiku.js — szybka odpowiedź Haiku na small-talk
const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_HAIKU } = require('./models');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Odpowiedz Haiku na proste wiadomości (small-talk, powitania)
async function askHaiku(messages, userName) {
  const response = await client.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 256,
    system: `Jesteś Iwan — asystent AI z energią Gogginsa. Odpowiadaj po polsku, krótko (1-2 zdania). Rozmawia z Tobą: ${userName}.`,
    messages,
  });
  return response.content[0].text;
}

module.exports = { askHaiku };
