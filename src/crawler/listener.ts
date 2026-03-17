// src/crawler/listener.js
const { saveSlackMessage } = require('./saveMessage');
const { getUserName } = require('../services/users');
const { getChannelName } = require('../services/channels');
const { isProactiveEnabled } = require('../proactive/config');

// Nasłuchuj WSZYSTKICH wiadomości w kanałach (nie tylko wzmianki)
function setupCrawler(app) {
  app.message(async ({ message }) => {
    // Ignoruj subtypy (edycje, usunięcia etc.)
    if (message.subtype) return;
    // Ignoruj boty
    if (message.bot_id) return;
    // Pobierz nazwy użytkownika i kanału
    const userName = await getUserName(app, message.user);
    const channelName = await getChannelName(app, message.channel);
    await saveSlackMessage({ ...message, user_name: userName, channel_name: channelName });

    // Hook proaktywny — fire-and-forget
    if (isProactiveEnabled()) {
      const { evaluateMessage } = require('../proactive/engine');
      evaluateMessage(app, message, channelName).catch(() => {});
    }
  });
  console.log('📡 Crawler Slack aktywny — zapisuję wiadomości z kanałów');
}

module.exports = { setupCrawler };
