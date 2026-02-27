// scripts/backfillFull.js — CLI do ręcznego backfillu z paginacją
require('dotenv').config();
const { App } = require('@slack/bolt');
const { backfillChannel, backfillAllChannels } = require('../src/crawler/backfill');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Uruchom backfill — konkretny kanał lub wszystkie
async function main() {
  const channelId = process.argv[2];

  if (channelId) {
    console.log(`🔄 Backfill kanału ${channelId}...`);
    await backfillChannel(app, channelId);
  } else {
    console.log('🔄 Backfill wszystkich kanałów...');
    await backfillAllChannels(app);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Błąd backfillu:', err.message);
  process.exit(1);
});
