// src/crawler/backfillTrigger.js — auto-backfill przy dołączeniu do kanału
const { backfillChannel } = require('./backfill');
const { logError } = require('../services/errors');

// Nasłuchuj member_joined_channel i triggeruj backfill dla bota
function setupBackfillTrigger(app) {
  app.event('member_joined_channel', async ({ event }) => {
    // Sprawdź czy to bot dołączył (nie inny user)
    const authResult = await app.client.auth.test();
    if (event.user !== authResult.user_id) return;

    console.log(`📥 Bot dołączył do kanału ${event.channel} — uruchamiam backfill`);

    // Wiadomość powitalna — wyślij od razu
    await app.client.chat.postMessage({
      channel: event.channel,
      text: 'Cześć! Jestem Iwan — AI asystent w Momentum. Wspomnij mnie @Iwan, a postaram się pomóc. 🤖',
    });

    // Fire-and-forget — nie blokuj event handlera
    backfillChannel(app, event.channel).catch(err => {
      logError('backfillTrigger', 'Błąd auto-backfillu', err.message);
    });
  });

  console.log('🔄 Backfill trigger aktywny — auto-backfill przy dołączeniu do kanału');
}

module.exports = { setupBackfillTrigger };
