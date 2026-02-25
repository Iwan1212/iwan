// src/crawler/listener.js
const { saveSlackMessage } = require('./saveMessage');

// Nasłuchuj WSZYSTKICH wiadomości w kanałach (nie tylko wzmianki)
function setupCrawler(app) {
  app.message(async ({ message }) => {
    // Ignoruj subtypy (edycje, usunięcia etc.)
    if (message.subtype) return;
    // Ignoruj boty
    if (message.bot_id) return;
    await saveSlackMessage(message);
  });
  console.log('📡 Crawler Slack aktywny — zapisuję wiadomości z kanałów');
}

module.exports = { setupCrawler };
