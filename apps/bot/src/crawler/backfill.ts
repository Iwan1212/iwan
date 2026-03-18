// src/crawler/backfill.ts — backfill historii kanału z paginacją
import { saveSlackMessage } from './saveMessage.js';
import { getUserName } from '../services/users.js';
import { getChannelName } from '../services/channels.js';
import { logError } from '../services/errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const PAGE_SIZE = 200;
const DELAY_MS = 1200;

// Czekaj określony czas (rate limit safety)
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Pobierz jedną stronę historii kanału
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPage(app: SlackApp, channelId: string, cursor: string | null): Promise<{ messages: any[]; nextCursor: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { channel: channelId, limit: PAGE_SIZE };
  if (cursor) params.cursor = cursor;

  const result = await app.client.conversations.history(params);
  return {
    messages: result.messages || [],
    nextCursor: result.response_metadata?.next_cursor || null,
  };
}

// Pobierz CAŁĄ historię kanału z paginacją i retry
export async function backfillChannel(app: SlackApp, channelId: string): Promise<number> {
  const channelName = await getChannelName(app, channelId);
  let cursor: string | null = null;
  let totalSaved = 0;
  let page = 0;

  // Zbierz wszystkie wiadomości ze wszystkich stron
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMessages: any[] = [];
  do {
    page++;
    let data;
    try {
      data = await fetchPage(app, channelId, cursor);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slackErr = err as any;
      if (slackErr.data?.error === 'ratelimited' || slackErr.code === 429) {
        const retryAfter = (slackErr.headers?.['retry-after'] ?? 10) * 1000;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = [...new Set(allMessages.filter((m: any) => m.user).map((m: any) => m.user as string))];
  const userNames: Record<string, string> = {};
  for (const userId of userIds) {
    userNames[userId] = await getUserName(app, userId);
  }

  // Zapisz wiadomości przez saveSlackMessage (upsert)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
export async function backfillAllChannels(app: SlackApp): Promise<number> {
  const result = await app.client.conversations.list({ types: 'public_channel' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels = (result.channels || []).filter((ch: any) => ch.is_member);
  let total = 0;

  for (const ch of channels) {
    const saved = await backfillChannel(app, ch.id);
    total += saved;
  }

  console.log(`🏁 Backfill wszystkich kanałów zakończony — ${total} wiadomości`);
  return total;
}
