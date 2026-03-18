// src/services/channelDigest.ts — codzienny raport aktywności kanałów → Slack
import { supabase } from './supabase.js';
import { ask } from './llm.js';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const DIGEST_CHANNEL = process.env.CHANNEL_DIGEST_CHANNEL || '';
const DIGEST_CHANNELS = (process.env.CHANNEL_DIGEST_CHANNELS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

interface ChannelActivity {
  channelId: string;
  channelName: string;
  messageCount: number;
  activeThreads: number;
  topUsers: { name: string; count: number }[];
  messages: { user_name: string; text: string; thread_ts?: string }[];
}

// Pobierz aktywność kanału z ostatnich 24h (z Supabase slack_messages)
export async function fetchChannelActivity(app: SlackApp, channelId: string): Promise<ChannelActivity> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from('slack_messages')
    .select('user_name, message_text, thread_ts, created_at')
    .eq('channel_id', channelId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) throw error;
  const messages = data || [];

  // Policz wątki (unikalne thread_ts)
  const threadSet = new Set<string>();
  for (const m of messages) {
    if (m.thread_ts) threadSet.add(m.thread_ts);
  }

  // Top users (top 5 po ilości wiadomości)
  const userCounts: Record<string, number> = {};
  for (const m of messages) {
    const name = m.user_name || 'unknown';
    userCounts[name] = (userCounts[name] || 0) + 1;
  }
  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Pobierz nazwę kanału z Slack API
  let channelName = channelId;
  try {
    const info = await app.client.conversations.info({ channel: channelId });
    channelName = info.channel?.name || channelId;
  } catch (_) {}

  return {
    channelId,
    channelName,
    messageCount: messages.length,
    activeThreads: threadSet.size,
    topUsers,
    messages: messages.map(m => ({
      user_name: m.user_name || 'unknown',
      text: m.message_text || '',
      thread_ts: m.thread_ts || undefined,
    })),
  };
}

// Wykryj pytania bez odpowiedzi (? bez reply w wątku, max 5)
export function detectUnansweredQuestions(messages: { user_name: string; text: string; thread_ts?: string }[]): string[] {
  const unanswered: string[] = [];
  const threadReplies = new Set<string>();

  // Zbierz wątki z odpowiedziami
  for (const m of messages) {
    if (m.thread_ts) threadReplies.add(m.thread_ts);
  }

  for (const m of messages) {
    if (unanswered.length >= 5) break;
    if (!m.text.includes('?')) continue;
    // Wiadomość nie jest odpowiedzią w wątku i nie ma reply
    if (!m.thread_ts && !threadReplies.has(m.text)) {
      unanswered.push(`${m.user_name}: ${m.text.substring(0, 100)}`);
    }
  }

  return unanswered;
}

// Wygeneruj podsumowanie aktywności kanału przez Claude (Haiku)
export async function generateChannelSummary(activity: ChannelActivity): Promise<string> {
  const messagesPreview = activity.messages
    .slice(-30)
    .map(m => `${m.user_name}: ${m.text}`)
    .join('\n');

  const unanswered = detectUnansweredQuestions(activity.messages);

  const prompt = `Podsumuj aktywność kanału Slack #${activity.channelName} z ostatnich 24h.

Statystyki:
- Wiadomości: ${activity.messageCount}
- Aktywne wątki: ${activity.activeThreads}
- Najbardziej aktywni: ${activity.topUsers.map(u => `${u.name} (${u.count})`).join(', ') || 'brak'}

Ostatnie wiadomości (fragment):
${messagesPreview || '(brak wiadomości)'}

${unanswered.length > 0 ? `Pytania bez odpowiedzi:\n${unanswered.join('\n')}` : ''}

Napisz krótkie podsumowanie (3-5 zdań) po polsku. Skup się na tematach biznesowych i ważnych dyskusjach. Użyj formatowania Slack.`;

  return ask({ tier: 'fast', maxTokens: 500, messages: [{ role: 'user', content: prompt }] });
}

// Uruchom codzienny digest kanałów
export async function runChannelDigest(app: SlackApp): Promise<void> {
  if (!DIGEST_CHANNEL || DIGEST_CHANNELS.length === 0) {
    console.log('[channel-digest] Brak konfiguracji (CHANNEL_DIGEST_CHANNEL / CHANNEL_DIGEST_CHANNELS)');
    return;
  }

  console.log(`[channel-digest] Start digest dla ${DIGEST_CHANNELS.length} kanałów...`);
  const sections: string[] = [];

  // Pobierz ID kanałów ze Slack
  let allChannels: { id: string; name: string }[] = [];
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel', limit: 1000, exclude_archived: true,
    });
    allChannels = (result.channels || []).map((ch: { id: string; name: string }) => ({ id: ch.id, name: ch.name }));
  } catch (error) {
    logError('channel-digest', 'Błąd listowania kanałów', (error as Error).message);
    return;
  }

  for (const channelName of DIGEST_CHANNELS) {
    const ch = allChannels.find(c => c.name === channelName);
    if (!ch) {
      console.log(`[channel-digest] Kanał '${channelName}' nie znaleziony — pomijam`);
      continue;
    }

    try {
      const activity = await fetchChannelActivity(app, ch.id);
      if (activity.messageCount === 0) {
        sections.push(`*#${channelName}* — brak aktywności`);
        continue;
      }

      const summary = await generateChannelSummary(activity);
      sections.push(`*#${channelName}* (${activity.messageCount} msg, ${activity.activeThreads} wątków)\n${summary}`);
    } catch (error) {
      logError('channel-digest', `Błąd przetwarzania #${channelName}`, (error as Error).message);
      sections.push(`*#${channelName}* — błąd przetwarzania`);
    }
  }

  // Wyślij digest na Slack
  const today = new Date().toISOString().split('T')[0];
  const message = `📊 *Channel Digest — ${today}*\n\n${sections.join('\n\n---\n\n')}`;

  try {
    await app.client.chat.postMessage({
      channel: DIGEST_CHANNEL,
      text: message,
    });
    console.log(`[channel-digest] Digest wysłany (${sections.length} kanałów)`);
  } catch (error) {
    logError('channel-digest', 'Błąd wysyłania digestu', (error as Error).message);
  }
}
