// src/crawler/backfillTrigger.js — auto-backfill przy dołączeniu do kanału (z approval flow)
const { sendApprovalRequest } = require('../handlers/approvalFlow');

// Nasłuchuj member_joined_channel i wyślij approval request do admina
function setupBackfillTrigger(app) {
  app.event('member_joined_channel', async ({ event }) => {
    // Sprawdź czy to bot dołączył (nie inny user)
    const authResult = await app.client.auth.test();
    if (event.user !== authResult.user_id) return;

    console.log(`📥 Bot dołączył do kanału ${event.channel} — wysyłam approval request`);

    await sendApprovalRequest(app, event.channel, event.inviter);
  });

  console.log('🔄 Backfill trigger aktywny — approval flow przy dołączeniu do kanału');
}

module.exports = { setupBackfillTrigger };
