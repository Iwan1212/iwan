// src/services/dealDigest.js — automatyczny daily digest: Slack → Pipedrive notes
const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_SONNET } = require('./models');
const { supabase } = require('./supabase');
const { getDealNotes, findAgentNote, createNote, updateNote, createActivity } = require('./pipedrive');
const { resolveChannelToDeal, resolveThreadToDeal } = require('./dealResolver');
const { loadAllKnowledge, loadKnowledgeFile } = require('./knowledge');
const { logError } = require('./errors');
const { SALES_PREFIX, MONITORED_CHANNELS, MIN_MESSAGES, NOTE_PREFIX, LANGUAGE } = require('./dealConfig');
const { cleanLlmJson, groupByThread } = require('./dealUtils');
const crypto = require('crypto');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIGEST_CHANNEL = process.env.DEAL_DIGEST_CHANNEL || '';
const DIGEST_HOUR = parseInt(process.env.DEAL_DIGEST_HOUR, 10) || 7;

// Zbuduj system prompt z kontekstem firmy i personą
function buildDigestSystemPrompt() {
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
function computeMessageHash(messages) {
  const text = messages.map(m => `${m.user_id || m.user || ''}:${m.message_text || m.text || ''}`).join('|');
  return crypto.createHash('md5').update(text).digest('hex');
}

// Pobierz stan digestu dla kanału/wątku
async function getDigestState(channelId) {
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
async function saveDigestState(channelId, lastTs, messageHash, dealId) {
  try {
    await supabase.from('deal_digest_state').upsert({
      channel_id: channelId,
      last_ts: lastTs,
      message_hash: messageHash,
      deal_id: dealId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'channel_id' });
  } catch (error) {
    logError('dealDigest', 'Błąd zapisu stanu digestu', error.message);
  }
}

// Pobierz nowe wiadomości z kanału od ostatniego runu (z Supabase slack_messages)
async function getNewMessages(channelId, lastTs = null) {
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
    return data || [];
  } catch (error) {
    logError('dealDigest', `Błąd pobierania wiadomości kanału ${channelId}`, error.message);
    return [];
  }
}

// Formatuj wiadomości do tekstu dla LLM
function formatMessages(messages) {
  return messages.map(m => {
    const name = m.user_name || m.user_id || 'unknown';
    const time = new Date(m.created_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return `${name} (${time}): ${m.message_text || ''}`;
  }).join('\n');
}

// Wygeneruj podsumowanie przez Claude
async function generateSummary(messages, deal) {
  const messagesText = formatMessages(messages);
  const timestamps = messages.map(m => new Date(m.created_at).getTime());
  const dateFrom = new Date(Math.min(...timestamps)).toISOString().split('T')[0];
  const dateTo = new Date(Math.max(...timestamps)).toISOString().split('T')[0];
  const orgName = deal.org_name || deal.org_id?.name || null;
  const orgPart = orgName ? ` (${orgName})` : '';

  try {
    const response = await client.messages.create({
      model: MODEL_SONNET,
      max_tokens: 2000,
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

    const result = cleanLlmJson(response.content[0].text);

    if (!result.has_meaningful_content) return null;

    // Dodaj prefix z datą
    const today = new Date().toISOString().split('T')[0];
    result.html_note = `<b>${NOTE_PREFIX} ${today} (${dateFrom} - ${dateTo})</b><br><br>${result.html_note}`;
    return result;
  } catch (error) {
    logError('dealDigest', `Błąd generowania podsumowania dla '${deal.title}'`, error.message);
    return null;
  }
}

// Zapisz podsumowanie do Pipedrive
async function writeSummaryToPipedrive(dealId, result) {
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
async function processDedicatedChannel(app, channelId, channelName) {
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
async function processThread(channelId, channelName, threadTs, threadMsgs) {
  const threadKey = `${channelId}:${threadTs}`;
  const threadState = await getDigestState(threadKey);
  const hash = computeMessageHash(threadMsgs);
  if (hash === threadState?.message_hash) return 0;

  const deal = await resolveThreadToDeal(threadMsgs, channelName, channelId, threadTs);
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
async function processSharedChannel(app, channelId, channelName) {
  const state = await getDigestState(channelId);
  const messages = await getNewMessages(channelId, state?.last_ts);
  if (messages.length === 0) return 0;

  const threads = groupByThread(messages);
  let written = 0;
  for (const [threadTs, threadMsgs] of Object.entries(threads)) {
    if (threadTs === 'main' || threadMsgs.length < MIN_MESSAGES) continue;
    written += await processThread(channelId, channelName, threadTs, threadMsgs);
  }

  // Zaktualizuj ogólny stan kanału
  const lastTs = messages[messages.length - 1].created_at;
  await saveDigestState(channelId, lastTs, computeMessageHash(messages), null);
  return written;
}

// Pobierz listę publicznych kanałów ze Slack (1 API call zamiast N+1)
async function listChannels(app) {
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel', limit: 1000, exclude_archived: true,
    });
    return result.channels || [];
  } catch (error) {
    logError('dealDigest', 'Błąd listowania kanałów', error.message);
    return [];
  }
}

// Uruchom daily digest
async function runDailyDigest(app) {
  console.log('[dealDigest] Start daily digest...');
  let totalSummaries = 0;
  const allChannels = await listChannels(app);

  // 1. Kanały dedykowane (#sales-*)
  const salesChannels = allChannels.filter(ch => ch.name.startsWith(SALES_PREFIX));
  for (const ch of salesChannels) {
    totalSummaries += await processDedicatedChannel(app, ch.id, ch.name);
  }

  // 2. Kanały monitorowane (shared, wątki per deal)
  for (const name of MONITORED_CHANNELS) {
    const ch = allChannels.find(c => c.name === name);
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
      logError('dealDigest', 'Błąd wysyłania statusu', error.message);
    }
  }
}

// Sprawdź czy to pora na digest (Pn-Pt o DIGEST_HOUR)
function isDigestTime(now) {
  const day = now.getDay();
  const hour = now.getHours();
  return day >= 1 && day <= 5 && hour === DIGEST_HOUR;
}

// Włącz scheduled digest (sprawdza co godzinę)
function setupDealDigest(app) {
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

module.exports = {
  setupDealDigest,
  runDailyDigest,
  isDigestTime,
  computeMessageHash,
  generateSummary,
  formatMessages,
  getNewMessages,
  getDigestState,
  saveDigestState,
  processDedicatedChannel,
  processSharedChannel,
};
