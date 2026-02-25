// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');

// Inicjalizacja aplikacji Slack w trybie Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Obsługa wzmianek @Iwan — odpowiedź echem
app.event('app_mention', async ({ event, say }) => {
  const tekst = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  await say(`Jestem Iwan 🤖 Usłyszałem: ${tekst}`);
});

// Start bota
(async () => {
  await app.start();
  console.log('🤖 Iwan działa w Socket Mode!');
})();
