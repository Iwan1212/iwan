// src/services/dealDigest.ts — automatyczny daily digest: Slack → Pipedrive notes
import { ask } from './llm.js';
import { supabase } from './supabase.js';
import { getDealNotes, findAgentNote, createNote, updateNote, createActivity } from './pipedrive.js';
import { resolveChannelToDeal, resolveThreadToDeal } from './dealResolver.js';
import { loadAllKnowledge, loadKnowledgeFile } from './knowledge.js';
import { logError } from './errors.js';
import { SALES_PREFIX, MONITORED_CHANNELS, MIN_MESSAGES, NOTE_PREFIX, LANGUAGE } from './dealConfig.js';
import { cleanLlmJson, groupByThread } from './dealUtils.js';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const DIGEST_CHANNEL = process.env.DEAL_DIGEST_CHANNEL || '';
const DIGEST_HOUR = parseInt(process.env.DEAL_DIGEST_HOUR || '', 10) || 7;

interface DigestMessage {
  user_id?: string;
  user_name?: string;
  user?: string;
  message_text?: string;
  text?: string;
  created_at: string;
  thread_ts?: string;
}

interface DigestResult {
  html_note: string;
  action_items: { subject: string; owner?: string }[];
  has_meaningful_content: boolean;
}

// Zbuduj system prompt z kontekstem firmy i personą
export function buildDigestSystemPrompt(): string {
  const companyContext = loadAllKnowledge();
  const persona = loadKnowledgeFile('bot-persona');
  return `You are a sales intelligence assistant. You create concise Slack conversation summaries for Pipedrive deal notes.

${companyContext ? `Company context:\n${companyContext}\n` : ''}${persona ? `\n${persona}\n` : ''}
Rules:
- Focus only on business content (ignore small talk, emoji reactions, greetings)
- If messages contain no business content, set has_meaningful_content to false
- HTML notes should be short and readable
- Do not use em dashes or en dashes. Use commas, periods, colons.
- Reference team members by first name
- Flag blockers and stale items proactively
${LANGUAGE !== 'en' ? `Always respond in ${LANGUAGE}.` : ''}`;
}

// Prompt do generowania podsumowania
const DIGEST_PROMPT = `Summarize new Slack messages for deal "{title}"{org_part}.
Period: {date_from} - {date_to}

Messages:
{messages_text}

Generate an HTML note for Pipedrive (no <html>, <body> tags) and a list of action items.

Return ONLY valid JSON (no markdown):
{
  "html_note": "<b>Summary</b>: ...<br><b>Decisions</b>: ...<br><b>Blockers</b>: ...<br><b>Next steps</b>: ...",
  "action_items": [{"subject": "task description", "owner": "person name"}],
  "has_meaningful_content": true
}

If messages are only small talk, set has_meaningful_content to false and return empty html_note.`;

// Oblicz hash wiadomości (do sprawdzania czy coś się zmieniło)
export function computeMessageHash(messages: DigestMessage[]): string {
  const text = messages.map(m => `${m.user_id || m.user || ''}:${m.message_text || m.text || ''}`).join('|');
  return crypto.createHash('md5').update(text).digest('hex');
}

// Pobierz stan digestu dla kanału/wątku
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDigestState(channelId: string): Promise<any> {
  try {
    const { data } = await supabase
      .from('deal_digest_state')
      .select('*')
      .eq('channel_id', channelId)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

// Zapisz stan digestu
export async function saveDigestState(channelId: string, lastTs: string, messageHash: string, dealId: number | null): Promise<void> {
  try {
    await supabase.from('deal_digest_state').upsert({
      channel_id: channelId,
      last_ts: lastTs,
      message_hash: messageHash,
      deal_id: dealId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id' });
  } catch (error) {
    logError('dealDigest', 'Błąd zapisu stanu digestu', (error as Error).message);
  }
}

// Pobierz nowe wiadomości z kanału od ostatniego runu (z Supabase slack_messages)
export async function getNewMessages(channelId: string, lastTs: string | null = null): Promise<DigestMessage[]> {
  try {
    let query = supabase
      .from('slack_messages')
      .select('user_id, user_name, message_text, created_at, thread_ts')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (lastTs) {
      query = query.gt('created_at', lastTs);
    } else {
      // Domyślnie ostatnie 24h
      const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      query = query.gt('created_at', yesterday);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DigestMessage[];
  } catch (error) {
    logError('dealDigest', `Błąd pobierania wiadomości kanału ${channelId}`, (error as Error).message);
    return [];
  }
}

// Formatuj wiadomości do tekstu dla LLM
export function formatMessages(messages: DigestMessage[]): string {
  return messages.map(m => {
    const name = m.user_name || m.user_id || 'unknown';
    const time = new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return `${name} (${time}): ${m.message_text || ''}`;
  }).join('\n');
}

// Wygeneruj podsumowanie przez Claude
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateSummary(messages: DigestMessage[], deal: any): Promise<DigestResult | null> {
  const messagesText = formatMessages(messages);
  const timestamps = messages.map(m => new Date(m.created_at).getTime());
  const dateFrom = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
  const dateTo = new Date(Math.max(...timestamps)).toISOString().split('T')[0];
  const orgName = deal.org_name || deal.org_id?.name || null;
  const orgPart = orgName ? ` (${orgName})` : '';

  try {
    const responseText = await ask({
      tier: 'smart',
      maxTokens: 2000,
      system: buildDigestSystemPrompt(),
      messages: [{
        role: 'user',
        content: DIGEST_PROMPT
          .replace('{title}', deal.title || 'Unknown')
          .replace('{org_part}', orgPart)
          .replace('{date_from}', dateFrom)
          .replace('{date_to}', dateTo)
          .replace('{messages_text}', messagesText),
      }],
    });

    const result = cleanLlmJson(responseText) as unknown as DigestResult;

    if (!result.has_meaningful_content) return null;

    // Dodaj prefix z datą
    const today = new Date().toISOString().split('T')[0];
    result.html_note = `<b>${NOTE_PREFIX} ${today} (${dateFrom} - ${dateTo})</b><br><br>${result.html_note}`;
    return result;
  } catch (error) {
    logError('dealDigest', `Błąd generowania podsumowania dla '${deal.title}'`, (error as Error).message);
    return null;
  }
}

// Zapisz podsumowanie do Pipedrive
async function writeSummaryToPipedrive(dealId: number, result: DigestResult): Promise<void> {
  const notes = await getDealNotes(dealId);
  const existingNote = findAgentNote(notes, NOTE_PREFIX);

  if (existingNote) {
    await updateNote(existingNote.id, result.html_note);
  } else {
    await createNote(dealId, result.html_note);
  }

  // Utwórz aktywności z action items (due date = jutro)
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];
  for (const item of (result.action_items || [])) {
    if (item.subject) {
      await createActivity(dealId, item.subject, 'task', tomorrow);
    }
  }
}

// Główna pętla digestu — przetwórz kanały dedykowane (#sales-*)
export async function processDedicatedChannel(app: SlackApp, channelId: string, channelName: string): Promise<number> {
  const state = await getDigestState(channelId);
  const messages = await getNewMessages(channelId, state?.last_ts);

  if (messages.length < MIN_MESSAGES) return 0;

  // Sprawdź hash — skip jeśli brak zmian
  const hash = computeMessageHash(messages);
  if (hash === state?.message_hash) return 0;

  // Resolve kanał na deal
  const deal = await resolveChannelToDeal(channelName, channelId);
  if (!deal) return 0;

  const result = await generateSummary(messages, deal);
  if (!result) return 0;

  await writeSummaryToPipedrive(deal.id, result);
  const lastTs = messages[messages.length - 1].created_at;
  await saveDigestState(channelId, lastTs, hash, deal.id);

  console.log(`[dealDigest] #${channelName} → deal '${deal.title}': podsumowanie zapisane`);
  return 1;
}

// Przetwórz pojedynczy wątek z shared channel
async function processThread(channelId: string, channelName: string, threadTs: string, threadMsgs: DigestMessage[]): Promise<number> {
  const threadKey = `${channelId}:${threadTs}`;
  const threadState = await getDigestState(threadKey);
  const hash = computeMessageHash(threadMsgs);
  if (hash === threadState?.message_hash) return 0;

  const deal = await resolveThreadToDeal(threadMsgs as unknown[], channelName, channelId, threadTs);
  if (!deal) return 0;

  const result = await generateSummary(threadMsgs, deal);
  if (!result) return 0;

  await writeSummaryToPipedrive(deal.id, result);
  const lastTs = threadMsgs[threadMsgs.length - 1].created_at;
  await saveDigestState(threadKey, lastTs, hash, deal.id);

  console.log(`[dealDigest] Wątek w #${channelName} → deal '${deal.title}': podsumowanie zapisane`);
  return 1;
}

// Przetwórz kanał shared (wątki pojedynczo)
export async function processSharedChannel(app: SlackApp, channelId: string, channelName: string): Promise<number> {
  const state = await getDigestState(channelId);
  const messages = await getNewMessages(channelId, state?.last_ts);
  if (messages.length === 0) return 0;

  const threads = groupByThread(messages as unknown[]);
  let written = 0;
  for (const [threadTs, threadMsgs] of Object.entries(threads)) {
    if (threadTs === 'main' || threadMsgs.length < MIN_MESSAGES) continue;
    written += await processThread(channelId, channelName, threadTs, threadMsgs as DigestMessage[]);
  }

  // Zaktualizuj ogólny stan kanału
  const lastTs = messages[messages.length - 1].created_at;
  await saveDigestState(channelId, lastTs, computeMessageHash(messages), null);
  return written;
}

// Pobierz listę publicznych kanałów ze Slack (1 API call zamiast N+1)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listChannels(app: SlackApp): Promise<any[]> {
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel', limit: 1000, exclude_archived: true,
    });
    return result.channels || [];
  } catch (error) {
    logError('dealDigest', 'Błąd listowania kanałów', (error as Error).message);
    return [];
  }
}

// Uruchom daily digest
async function runDailyDigest(app: SlackApp): Promise<void> {
  console.log('[dealDigest] Start daily digest...');
  let totalSummaries = 0;
  const allChannels = await listChannels(app);

  // 1. Kanały dedykowane (#sales-*)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salesChannels = allChannels.filter((ch: any) => ch.name.startsWith(SALES_PREFIX));
  for (const ch of salesChannels) {
    totalSummaries += await processDedicatedChannel(app, ch.id, ch.name);
  }

  // 2. Kanały monitorowane (shared, wątki per deal)
  for (const name of MONITORED_CHANNELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = allChannels.find((c: any) => c.name === name);
    if (!ch) {
      console.log(`[dealDigest] Kanał '${name}' nie znaleziony — pomijam`);
      continue;
    }
    totalSummaries += await processSharedChannel(app, ch.id, ch.name);
  }

  console.log(`[dealDigest] Digest zakończony. Zapisano ${totalSummaries} podsumowań.`);

  // Opcjonalnie: wyślij status na Slack
  if (DIGEST_CHANNEL && totalSummaries > 0) {
    try {
      await app.client.chat.postMessage({
        channel: DIGEST_CHANNEL,
        text: `📊 *Deal Digest* — zapisano ${totalSummaries} podsumowań do Pipedrive.`,
      });
    } catch (error) {
      logError('dealDigest', 'Błąd wysyłania statusu', (error as Error).message);
    }
  }
}

// Sprawdź czy to pora na digest (Pn-Pt o DIGEST_HOUR)
export function isDigestTime(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour === DIGEST_HOUR;
}

// Włącz scheduled digest (sprawdza co godzinę)
export function setupDealDigest(app: SlackApp): void {
  if (!process.env.PIPEDRIVE_API_TOKEN) {
    console.log('[dealDigest] Brak PIPEDRIVE_API_TOKEN — digest wyłączony');
    return;
  }

  setInterval(() => {
    if (isDigestTime(new Date())) {
      runDailyDigest(app);
    }
  }, 3600 * 1000);

  console.log(`[dealDigest] Daily digest włączony (Pn-Pt o ${DIGEST_HOUR}:00)`);
}
