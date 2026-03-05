// src/proactive/channelResolver.js — resolving nazw kanałów na ID
const { getProactiveChannelNames } = require('./config');

// Cache: name → id
let channelMap = new Map();

// Rozwiąż nazwy kanałów na ID (raz przy starcie)
async function resolveProactiveChannels(app) {
  const names = getProactiveChannelNames();
  if (names.length === 0) return;

  try {
    const result = await app.client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 1000,
    });

    const allChannels = result.channels || [];
    const nameSet = new Set(names);

    for (const ch of allChannels) {
      if (nameSet.has(ch.name)) {
        channelMap.set(ch.name, ch.id);
      }
    }

    console.log(`[proactive] Resolved ${channelMap.size}/${names.length} kanałów: ${[...channelMap.keys()].join(', ')}`);
  } catch (error) {
    console.error('[proactive] Błąd resolving kanałów:', error.message);
  }
}

// Sprawdź czy kanał jest proaktywny (po ID)
function isProactiveChannel(channelId) {
  for (const id of channelMap.values()) {
    if (id === channelId) return true;
  }
  return false;
}

// Eksportuj do testów
function _getChannelMap() {
  return channelMap;
}

function _setChannelMap(map) {
  channelMap = map;
}

module.exports = { resolveProactiveChannels, isProactiveChannel, _getChannelMap, _setChannelMap };
