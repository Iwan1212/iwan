// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');
const { askClaude } = require('./services/claude');
const { validateMessage } = require('./services/validate');
const { checkRateLimit } = require('./services/ratelimit');
const { classifyMessage } = require('./services/classify');

// Inicjalizacja aplikacji Slack w trybie Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Obsługa wzmianek @Iwan — z guardrails
app.event('app_mention', async ({ event, say }) => {
  const tekst = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

  // 1. Walidacja
  const walidacja = validateMessage(tekst);
  if (!walidacja.valid) { await say(walidacja.error); return; }

  // 2. Rate limit
  const limit = checkRateLimit(event.user);
  if (!limit.allowed) { await say(limit.error); return; }

  // 3. Klasyfikacja
  const kategoria = await classifyMessage(tekst);
  if (kategoria === 'spam') { await say('Nie mogę pomóc z tym zapytaniem.'); return; }

  // 4. Odpowiedź z Claude
  const odpowiedz = await askClaude(tekst);
  await say(odpowiedz);
});

// Start bota
(async () => {
  await app.start();
  console.log('🤖 Iwan działa w Socket Mode!');
})();
