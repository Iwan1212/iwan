// src/crawler/backfill.js — backfill historii kanału z paginacją
const { saveSlackMessage } = require('./saveMessage');
const { getUserName } = require('../services/users');
const { getChannelName } = require('../services/channels');
const { logError } = require('../services/errors');

const PAGE_SIZE = 200;
const DELAY_MS = 1200;

// Czekaj określony czas (rate limit safety)
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Pobierz jedną stronę historii kanału
async function fetchPage(app, channelId, cursor) {
  const params = { channel: channelId, limit: PAGE_SIZE };
  if (cursor) params.cursor = cursor;

  const result = await app.client.conversations.history(params);
  return {
    messages: result.messages || [],
    nextCursor: result.response_metadata?.next_cursor || null,
  };
}

// Pobierz CAŁĄ historię kanału z paginacją i retry
async function backfillChannel(app, channelId) {
  const channelName = await getChannelName(app, channelId);
  let cursor = null;
  let totalSaved = 0;
  let page = 0;

  // Zbierz wszystkie wiadomości ze wszystkich stron
  const allMessages = [];
  do {
    page++;
    let data;
    try {
      data = await fetchPage(app, channelId, cursor);
    } catch (err) {
      if (err.data?.error === 'ratelimited' || err.code === 429) {
        const retryAfter = (err.headers?.['retry-after'] ?? 10) * 1000;
        console.log(`⏳ Rate limit — czekam ${retryAfter / 1000}s...`);
        await delay(retryAfter);
        data = await fetchPage(app, channelId, cursor);
      } else {
        throw err;
      }
    }

    allMessages.push(...data.messages);
    console.log(`📄 ${channelName}: strona ${page} — ${data.messages.length} wiadomości`);
    cursor = data.nextCursor;

    if (cursor) await delay(DELAY_MS);
  } while (cursor);

  // Batch user name resolution — zbierz unikalne IDs, resolwuj raz
  const userIds = [...new Set(allMessages.filter(m => m.user).map(m => m.user))];
  const userNames = {};
  for (const userId of userIds) {
    userNames[userId] = await getUserName(app, userId);
  }

  // Zapisz wiadomości przez saveSlackMessage (upsert)
  for (const msg of allMessages) {
    if (msg.bot_id || !msg.text) continue;
    await saveSlackMessage({
      channel: channelId,
      channel_name: channelName,
      user: msg.user,
      user_name: userNames[msg.user] || null,
      text: msg.text,
      thread_ts: msg.thread_ts || null,
      ts: msg.ts,
    });
    totalSaved++;
  }

  console.log(`✅ ${channelName}: backfill zakończony — ${totalSaved} wiadomości`);
  return totalSaved;
}

// Backfilluj wszystkie kanały, w których bot jest członkiem
async function backfillAllChannels(app) {
  const result = await app.client.conversations.list({ types: 'public_channel' });
  const channels = (result.channels || []).filter(ch => ch.is_member);
  let total = 0;

  for (const ch of channels) {
    const saved = await backfillChannel(app, ch.id);
    total += saved;
  }

  console.log(`🏁 Backfill wszystkich kanałów zakończony — ${total} wiadomości`);
  return total;
}

module.exports = { backfillChannel, backfillAllChannels };
