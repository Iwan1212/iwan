// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');
const { askClaude, askClaudeWithHistory, askClaudeWithContext } = require('./services/claude');
const { searchSlackHistory, buildContextFromMessages } = require('./services/search');
const { validateMessage } = require('./services/validate');
const { checkRateLimit } = require('./services/ratelimit');
const { classifyMessage } = require('./services/classify');
const { saveMessage, getHistory } = require('./services/memory');
const { setupCrawler } = require('./crawler/listener');
const { toSlackMarkdown } = require('./services/format');
const { resolveUserNames } = require('./services/users');

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

  // 4. Wyszukaj kontekst w historii Slack (tylko z tego kanału)
  const wyniki = await searchSlackHistory(tekst, event.channel);
  await resolveUserNames(app, wyniki);
  const kontekst = buildContextFromMessages(wyniki);

  // 5. Pobierz historię rozmowy
  const historia = await getHistory(event.channel, event.thread_ts);
  const messages = historia.map(msg => ({ role: msg.role, content: msg.content }));
  messages.push({ role: 'user', content: tekst });

  // 6. Odpowiedź z Claude (z kontekstem i historią)
  let odpowiedz;
  if (kontekst) {
    odpowiedz = await askClaudeWithContext(tekst, kontekst);
  } else if (messages.length > 1) {
    odpowiedz = await askClaudeWithHistory(messages);
  } else {
    odpowiedz = await askClaude(tekst);
  }

  // 7. Zapisz rozmowę
  await saveMessage(event.channel, event.thread_ts, event.user, 'user', tekst);
  await saveMessage(event.channel, event.thread_ts, 'iwan', 'assistant', odpowiedz);

  // 8. Sformatuj i wyślij odpowiedź (w wątku jeśli pytanie było w wątku)
  const sformatowana = toSlackMarkdown(odpowiedz);
  const threadTs = event.thread_ts || event.ts;
  await say({ text: sformatowana, thread_ts: threadTs });
});

// Włącz crawler wiadomości
setupCrawler(app);

// Start bota
(async () => {
  await app.start();
  console.log('🤖 Iwan działa w Socket Mode!');
})();

// Health check — loguj co 5 minut
setInterval(() => {
  console.log(`💚 Iwan żyje — ${new Date().toISOString()}`);
}, 5 * 60 * 1000);
