// src/crawler/backfillTrigger.ts — auto-backfill przy dołączeniu do kanału (z approval flow)
import { sendApprovalRequest } from '../handlers/approvalFlow.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Nasłuchuj member_joined_channel i wyślij approval request do admina
export function setupBackfillTrigger(app: SlackApp): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.event('member_joined_channel', async ({ event }: any) => {
    // Sprawdź czy to bot dołączył (nie inny user)
    const authResult = await app.client.auth.test();
    if (event.user !== authResult.user_id) return;

    console.log(`📥 Bot dołączył do kanału ${event.channel} — wysyłam approval request`);
    console.log(`📥 Event details: user=${event.user}, inviter=${event.inviter}, channel=${event.channel}`);

    try {
      await sendApprovalRequest(app, event.channel, event.inviter);
      console.log(`✅ Approval request wysłany dla kanału ${event.channel}`);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.error(`❌ Błąd approval request dla kanału ${event.channel}:`, (err as Error).message, (err as any).data || '');
    }
  });

  console.log('🔄 Backfill trigger aktywny — approval flow przy dołączeniu do kanału');
}
