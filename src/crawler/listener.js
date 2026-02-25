// src/crawler/listener.js
const { saveSlackMessage } = require('./saveMessage');

// Nasłuchuj WSZYSTKICH wiadomości w kanałach (nie tylko wzmianki)
function setupCrawler(app) {
  app.event('message', async ({ event }) => {
    // Ignoruj subtypy (edycje, usunięcia etc.)
    if (event.subtype) return;
    await saveSlackMessage(event);
  });
  console.log('📡 Crawler Slack aktywny — zapisuję wiadomości z kanałów');
}

module.exports = { setupCrawler };
