// src/handlers/approvalFlow.ts — approval flow przy dołączaniu do kanału
import { backfillChannel } from '../crawler/backfill.js';
import { logError } from '../services/errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

interface PendingApproval {
  channelId: string;
  channelName: string;
  inviterId: string | undefined;
}

// Pending approvals — in-memory store (Map<channelId, { channelId, channelName, inviterId }>)
export const pendingApprovals = new Map<string, PendingApproval>();

const ADMIN_USER_ID = process.env.SLACK_ADMIN_USER_ID;
const SALES_PREFIX = process.env.DEAL_SALES_PREFIX || 'sales-';

// Wybierz tekst powitania — dedykowany dla sales channels, standardowy dla pozostałych
export function buildWelcomeText(channelName: string): string {
  if (channelName.startsWith(SALES_PREFIX)) {
    return [
      'Cześć! Jestem *Iwan* — AI asystent w Momentum. 🤖',
      '',
      'W tym kanale będę:',
      '• 📊 Codziennie rano (Pn–Pt o 7:00) podsumowywać wątki i zapisywać do Pipedrive jako notatkę `[Slack Summary]`',
      '• 🔍 Na żądanie mapować rozmowy do deala w CRM — napisz `@Iwan podsumuj ten wątek`',
      '• 💬 Odpowiadać na pytania o tego klienta — `@Iwan jaki jest status?`',
      '',
      'Komendy: `/iwan deal <nazwa>` · `/iwan deals` · `/iwan status`',
      '',
      'Zaczynam od backfilla historii kanału. ⏳',
    ].join('\n');
  }
  return 'Cześć! Jestem Iwan — AI asystent w Momentum. Wspomnij mnie @Iwan, a postaram się pomóc. 🤖';
}

// Wyślij DM do admina z przyciskami zatwierdzenia
export async function sendApprovalRequest(app: SlackApp, channelId: string, inviterId?: string): Promise<void> {
  const channelInfo = await app.client.conversations.info({ channel: channelId });
  const channelName = channelInfo.channel.name;

  const inviterMention = inviterId ? `<@${inviterId}>` : 'ktoś';

  pendingApprovals.set(channelId, { channelId, channelName, inviterId });

  await app.client.chat.postMessage({
    channel: ADMIN_USER_ID,
    text: `Zostałem dodany do #${channelName} przez ${inviterMention} — zatwierdzasz?`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Zostałem dodany do *#${channelName}* przez ${inviterMention} — zatwierdzasz?`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Zatwierdź' },
            style: 'primary',
            action_id: 'approve_channel',
            value: channelId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Odrzuć' },
            style: 'danger',
            action_id: 'reject_channel',
            value: channelId,
          },
        ],
      },
    ],
  });
}

// Zarejestruj action handlery dla approve/reject
export function setupApprovalActions(app: SlackApp): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.action('approve_channel', async ({ action, body, client }: any) => {
    const channelId = action.value;

    // Idempotencja — Slack ponawia request jeśli pierwsza odpowiedź nie wróci w 3s.
    // Atomic check-and-delete: drugi event widzi pusty stan i wraca bez side-effects.
    const pending = pendingApprovals.get(channelId);
    if (!pending) return;
    pendingApprovals.delete(channelId);

    // Pobierz nazwę kanału (z pending lub Slack API jako fallback)
    let channelName = pending.channelName || '';
    if (!channelName) {
      try {
        const info = await client.conversations.info({ channel: channelId });
        channelName = info.channel?.name || '';
      } catch { /* fallback do standardowego powitania */ }
    }

    // Wyślij wiadomość powitalną do kanału (dedykowaną dla sales lub standardową)
    await client.chat.postMessage({
      channel: channelId,
      text: buildWelcomeText(channelName),
    });

    // Backfill — fire-and-forget
    backfillChannel(app, channelId).catch((err: Error) => {
      logError('approvalFlow', 'Błąd backfillu po zatwierdzeniu', err.message);
    });

    // Zaktualizuj DM admina — usuń przyciski, dodaj potwierdzenie
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: '✅ Zatwierdzono',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${body.message.blocks[0].text.text}\n\n✅ *Zatwierdzono* — wysłałem powitanie i uruchomiłem backfill.`,
          },
        },
      ],
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.action('reject_channel', async ({ action, body, client }: any) => {
    const channelId = action.value;

    // Idempotencja — patrz approve_channel
    if (!pendingApprovals.has(channelId)) return;
    pendingApprovals.delete(channelId);

    // Opuść kanał
    await client.conversations.leave({ channel: channelId });

    // Zaktualizuj DM admina
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: '❌ Odrzucono — opuściłem kanał',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${body.message.blocks[0].text.text}\n\n❌ *Odrzucono* — opuściłem kanał.`,
          },
        },
      ],
    });
  });

  console.log('✅ Approval flow aktywny');
}
