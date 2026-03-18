// scripts/backfill.js
require('dotenv').config();
const { App } = require('@slack/bolt');
const { supabase } = require('../src/services/supabase');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Pobierz historię jednego kanału (max 200 wiadomości)
async function backfillChannel(channelId, channelName) {
  const result = await app.client.conversations.history({
    channel: channelId,
    limit: 200,
  });

  let saved = 0;
  for (const msg of result.messages) {
    if (msg.bot_id || !msg.text) continue;
    const { error } = await supabase
      .from('slack_messages')
      .upsert({
        channel_id: channelId,
        channel_name: channelName,
        user_id: msg.user || 'unknown',
        message_text: msg.text,
        thread_ts: msg.thread_ts || null,
        message_ts: msg.ts,
      }, { onConflict: 'message_ts' });
    if (!error) saved++;
  }
  console.log(`✅ ${channelName}: zapisano ${saved} wiadomości`);
}

// Pobierz listę kanałów i backfilluj każdy
async function backfillAll() {
  const channels = await app.client.conversations.list({ types: 'public_channel' });
  for (const ch of channels.channels) {
    if (ch.is_member) {
      await backfillChannel(ch.id, ch.name);
    }
  }
  console.log('🏁 Backfill zakończony');
  process.exit(0);
}

backfillAll();
