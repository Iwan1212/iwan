// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');
const { askClaude } = require('./services/claude');
const { validateMessage } = require('./services/validate');
const { checkRateLimit } = require('./services/ratelimit');
const { classifyMessage } = require('./services/classify');
const { saveMessage, getHistory } = require('./services/memory');

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

  // 4. Pobierz historię rozmowy
  const historia = await getHistory(event.channel, event.thread_ts);
  const messages = historia.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: tekst });

  // 5. Odpowiedź z Claude (z historią)
  const odpowiedz = await askClaude(tekst);

  // 6. Zapisz rozmowę
  await saveMessage(event.channel, event.thread_ts, event.user, 'user', tekst);
  await saveMessage(event.channel, event.thread_ts, 'iwan', 'assistant', odpowiedz);

  await say(odpowiedz);
});

// Start bota
(async () => {
  await app.start();
  console.log('🤖 Iwan działa w Socket Mode!');
})();
