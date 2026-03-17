// src/services/channels.js

const { logError } = require('./errors');

const channelCache = new Map();

// Pobierz nazwę kanału z Slack API (z cache)
async function getChannelName(app, channelId) {
  if (channelCache.has(channelId)) return channelCache.get(channelId);

  try {
    const result = await app.client.conversations.info({ channel: channelId });
    const name = result.channel.name || channelId;
    channelCache.set(channelId, name);
    return name;
  } catch (error) {
    logError('channels', 'Błąd pobierania channel info', error.message);
    return channelId;
  }
}

module.exports = { getChannelName };
