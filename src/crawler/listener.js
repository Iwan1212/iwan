// src/crawler/listener.js
const { saveSlackMessage } = require('./saveMessage');
const { getUserName } = require('../services/users');

// Nasłuchuj WSZYSTKICH wiadomości w kanałach (nie tylko wzmianki)
function setupCrawler(app) {
  app.message(async ({ message }) => {
    // Ignoruj subtypy (edycje, usunięcia etc.)
    if (message.subtype) return;
    // Ignoruj boty
    if (message.bot_id) return;
    // Pobierz nazwę użytkownika i dopisz do wiadomości
    const userName = await getUserName(app, message.user);
    await saveSlackMessage({ ...message, user_name: userName });
  });
  console.log('📡 Crawler Slack aktywny — zapisuję wiadomości z kanałów');
}

module.exports = { setupCrawler };
