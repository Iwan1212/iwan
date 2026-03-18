// src/services/channelAnomaly.ts — detekcja anomalii kanałów (volume spike, unanswered questions)
import { supabase } from './supabase.js';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const ALERT_CHANNEL = process.env.CHANNEL_ANOMALY_CHANNEL || '';
const MONITORED_CHANNELS = (process.env.CHANNEL_ANOMALY_CHANNELS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const SPIKE_MULTIPLIER = parseFloat(process.env.CHANNEL_ANOMALY_SPIKE_MULTIPLIER || '') || 3;

// Rolling window — 7 dni × 48 bucketów (30-min slots) per kanał
const WINDOW_SIZE = 7 * 48; // 336 bucketów
const channelWindows = new Map<string, number[]>();

// Zarejestruj aktywność kanału (ilość wiadomości w bieżącym 30-min slocie)
export function recordActivity(channelId: string, count: number): void {
  const window = channelWindows.get(channelId) || [];
  window.push(count);
  // Ogranicz do WINDOW_SIZE
  if (window.length > WINDOW_SIZE) {
    channelWindows.set(channelId, window.slice(-WINDOW_SIZE));
  } else {
    channelWindows.set(channelId, window);
  }
}

// Oblicz średnią aktywność kanału
export function getAverageActivity(channelId: string): number {
  const window = channelWindows.get(channelId);
  if (!window || window.length === 0) return 0;
  const sum = window.reduce((a, b) => a + b, 0);
  return sum / window.length;
}

// Wykryj spike wolumenu (bieżąca aktywność > średnia × SPIKE_MULTIPLIER)
export function detectVolumeSpike(channelId: string, current: number): boolean {
  const avg = getAverageActivity(channelId);
  if (avg === 0) return false;
  return current > avg * SPIKE_MULTIPLIER;
}

// Wykryj klaster nieodpowiedzianych pytań (3+ pytania bez reply w ostatnich 30 min)
export async function detectUnansweredClusters(app: SlackApp, channelId: string): Promise<string[]> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('slack_messages')
      .select('user_name, message_text, thread_ts')
      .eq('channel_id', channelId)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;
    const messages = data || [];

    // Zbierz wątki z odpowiedziami
    const threadReplies = new Set<string>();
    for (const m of messages) {
      if (m.thread_ts) threadReplies.add(m.thread_ts);
    }

    // Znajdź pytania bez odpowiedzi
    const unanswered: string[] = [];
    for (const m of messages) {
      const text = m.message_text || '';
      if (!text.includes('?')) continue;
      if (!m.thread_ts && !threadReplies.has(text)) {
        unanswered.push(`${m.user_name || 'unknown'}: ${text.substring(0, 100)}`);
      }
    }

    return unanswered.length >= 3 ? unanswered : [];
  } catch (error) {
    logError('channel-anomaly', `Błąd pobierania wiadomości kanału ${channelId}`, (error as Error).message);
    return [];
  }
}

// Pobierz liczbę wiadomości z ostatnich 30 min
async function getRecentMessageCount(channelId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from('slack_messages')
      .select('id')
      .eq('channel_id', channelId)
      .gt('created_at', since);

    if (error) throw error;
    return (data || []).length;
  } catch {
    return 0;
  }
}

// Pobierz listę kanałów ze Slack
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listChannels(app: SlackApp): Promise<any[]> {
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel', limit: 1000, exclude_archived: true,
    });
    return result.channels || [];
  } catch (error) {
    logError('channel-anomaly', 'Błąd listowania kanałów', (error as Error).message);
    return [];
  }
}

// Sprawdź anomalie kanałów (wywoływane co 30 min przez scheduler)
export async function checkChannelAnomalies(app: SlackApp): Promise<void> {
  if (!ALERT_CHANNEL || MONITORED_CHANNELS.length === 0) {
    console.log('[channel-anomaly] Brak konfiguracji — pomijam');
    return;
  }

  const allChannels = await listChannels(app);
  const alerts: string[] = [];

  for (const channelName of MONITORED_CHANNELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = allChannels.find((c: any) => c.name === channelName);
    if (!ch) continue;

    try {
      // Sprawdź ilość wiadomości w ostatnich 30 min
      const count = await getRecentMessageCount(ch.id);
      recordActivity(ch.id, count);

      // Volume spike
      if (detectVolumeSpike(ch.id, count)) {
        const avg = Math.round(getAverageActivity(ch.id));
        alerts.push(`📈 *Volume spike* na #${channelName}: ${count} msg/30min (średnia: ${avg})`);
      }

      // Unanswered questions cluster
      const unanswered = await detectUnansweredClusters(app, ch.id);
      if (unanswered.length > 0) {
        alerts.push(`❓ *Nieodpowiedziane pytania* na #${channelName} (${unanswered.length}):\n${unanswered.slice(0, 5).join('\n')}`);
      }
    } catch (error) {
      logError('channel-anomaly', `Błąd sprawdzania #${channelName}`, (error as Error).message);
    }
  }

  if (alerts.length > 0) {
    try {
      await app.client.chat.postMessage({
        channel: ALERT_CHANNEL,
        text: `*Channel Anomaly Alert*\n\n${alerts.join('\n\n')}`,
      });
      console.log(`[channel-anomaly] Wysłano ${alerts.length} alertów`);
    } catch (error) {
      logError('channel-anomaly', 'Błąd wysyłania alertów', (error as Error).message);
    }
  }
}

// Eksport dla testów
export function _getChannelWindows(): Map<string, number[]> {
  return channelWindows;
}
