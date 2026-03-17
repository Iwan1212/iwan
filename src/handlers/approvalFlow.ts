// src/handlers/approvalFlow.js — approval flow przy dołączaniu do kanału
const { backfillChannel } = require('../crawler/backfill');
const { logError } = require('../services/errors');

// Pending approvals — in-memory store (Map<channelId, { channelId, inviterId }>)
const pendingApprovals = new Map();

const ADMIN_USER_ID = process.env.SLACK_ADMIN_USER_ID;

// Wyślij DM do admina z przyciskami zatwierdzenia
async function sendApprovalRequest(app, channelId, inviterId) {
  const channelInfo = await app.client.conversations.info({ channel: channelId });
  const channelName = channelInfo.channel.name;

  const inviterMention = inviterId ? `<@${inviterId}>` : 'ktoś';

  pendingApprovals.set(channelId, { channelId, inviterId });

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
function setupApprovalActions(app) {
  app.action('approve_channel', async ({ action, body, client }) => {
    const channelId = action.value;

    // Wyślij wiadomość powitalną do kanału
    await client.chat.postMessage({
      channel: channelId,
      text: 'Cześć! Jestem Iwan — AI asystent w Momentum. Wspomnij mnie @Iwan, a postaram się pomóc. 🤖',
    });

    // Backfill — fire-and-forget
    backfillChannel(app, channelId).catch(err => {
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

    pendingApprovals.delete(channelId);
  });

  app.action('reject_channel', async ({ action, body, client }) => {
    const channelId = action.value;

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

    pendingApprovals.delete(channelId);
  });

  console.log('✅ Approval flow aktywny');
}

module.exports = { sendApprovalRequest, setupApprovalActions, pendingApprovals };
