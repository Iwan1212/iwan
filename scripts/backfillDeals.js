#!/usr/bin/env node
// scripts/backfillDeals.js — backfill deal digest z historycznych wiadomości
//
// Użycie:
//   node scripts/backfillDeals.js                    # Ostatnie 24h
//   node scripts/backfillDeals.js --days 7           # Ostatnie 7 dni
//   node scripts/backfillDeals.js --deal "Acme"      # Konkretny deal
//   node scripts/backfillDeals.js --dry-run           # Preview bez zapisu
//   node scripts/backfillDeals.js --days 7 --dry-run  # Kombinacja

require('dotenv').config();
const { App } = require('@slack/bolt');
const { supabase } = require('../src/services/supabase');
const { searchDeals, getDeal, getDealNotes, findAgentNote, createNote, updateNote, createActivity, isPipedriveEnabled } = require('../src/services/pipedrive');
const { resolveChannelToDeal, resolveThreadToDeal } = require('../src/services/dealResolver');
const { generateSummary, computeMessageHash, formatMessages } = require('../src/services/dealDigest');
const { SALES_PREFIX, MONITORED_CHANNELS, MIN_MESSAGES, NOTE_PREFIX } = require('../src/services/dealConfig');
const { groupByThread } = require('../src/services/dealUtils');

// Parsuj argumenty CLI
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { days: 1, dryRun: false, deal: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      options.days = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--deal' && args[i + 1]) {
      options.deal = args[i + 1];
      i++;
    }
  }
  return options;
}

// Pobierz wiadomości z Supabase za dany okres
async function getMessagesForPeriod(channelId, days) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('slack_messages')
    .select('user_id, user_name, message_text, created_at, thread_ts')
    .eq('channel_id', channelId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    console.error(`Błąd pobierania wiadomości: ${error.message}`);
    return [];
  }
  return data || [];
}

// Zapisz podsumowanie do Pipedrive
async function writeToPipedrive(dealId, result, dryRun) {
  if (dryRun) {
    const cleanHtml = result.html_note.replace(/<[^>]+>/g, ' ').trim();
    console.log(`  [DRY RUN] Notatka: ${cleanHtml.substring(0, 200)}...`);
    for (const item of (result.action_items || [])) {
      console.log(`  [DRY RUN] Aktywność: ${item.subject}`);
    }
    return;
  }

  const notes = await getDealNotes(dealId);
  const existing = findAgentNote(notes, NOTE_PREFIX);
  if (existing) {
    await updateNote(existing.id, result.html_note);
  } else {
    await createNote(dealId, result.html_note);
  }
  for (const item of (result.action_items || [])) {
    if (item.subject) await createActivity(dealId, item.subject);
  }
}

// Główna funkcja backfillu
async function main() {
  const options = parseArgs();
  console.log(`Deal Backfill: ${options.days} dni${options.dryRun ? ' [DRY RUN]' : ''}${options.deal ? ` (deal: ${options.deal})` : ''}`);

  if (!isPipedriveEnabled()) {
    console.error('PIPEDRIVE_API_TOKEN nie jest ustawiony!');
    process.exit(1);
  }

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  let totalSummaries = 0;

  // Tryb pojedynczego deala
  if (options.deal) {
    const deals = await searchDeals(options.deal);
    if (deals.length === 0) {
      console.error(`Deal '${options.deal}' nie znaleziony w Pipedrive.`);
      process.exit(1);
    }
    const deal = deals.find(d => d.status === 'open') || deals[0];
    console.log(`Deal: ${deal.title} (ID: ${deal.id})`);
    console.log('Tryb pojedynczego deala: poszukiwanie powiązanych kanałów nie jest jeszcze zaimplementowane w backfillu.');
    process.exit(0);
  }

  // Odkryj kanały #sales-*
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel', limit: 1000, exclude_archived: true,
    });
    const salesChannels = (result.channels || []).filter(ch => ch.name.startsWith(SALES_PREFIX));

    console.log(`Znaleziono ${salesChannels.length} kanałów ${SALES_PREFIX}*`);

    for (const ch of salesChannels) {
      const messages = await getMessagesForPeriod(ch.id, options.days);
      if (messages.length < MIN_MESSAGES) {
        console.log(`  #${ch.name}: ${messages.length} wiadomości (poniżej progu) — pomijam`);
        continue;
      }

      const deal = await resolveChannelToDeal(ch.name, ch.id);
      if (!deal) {
        console.log(`  #${ch.name}: brak pasującego deala — pomijam`);
        continue;
      }

      console.log(`  #${ch.name} → deal '${deal.title}' (${messages.length} wiadomości)`);
      const result = await generateSummary(messages, deal);
      if (!result) {
        console.log(`  #${ch.name}: brak istotnej treści — pomijam`);
        continue;
      }

      await writeToPipedrive(deal.id, result, options.dryRun);
      totalSummaries++;
    }

    // Kanały monitorowane (shared)
    for (const name of MONITORED_CHANNELS) {
      const ch = (result.channels || []).find(c => c.name === name);
      if (!ch) {
        console.log(`  Kanał '${name}' nie znaleziony — pomijam`);
        continue;
      }

      const messages = await getMessagesForPeriod(ch.id, options.days);
      if (messages.length === 0) continue;

      const threads = groupByThread(messages);

      for (const [threadTs, threadMsgs] of Object.entries(threads)) {
        if (threadTs === 'main' || threadMsgs.length < MIN_MESSAGES) continue;

        const deal = await resolveThreadToDeal(threadMsgs, ch.name, ch.id, threadTs);
        if (!deal) continue;

        console.log(`  #${ch.name} wątek → deal '${deal.title}' (${threadMsgs.length} wiadomości)`);
        const summaryResult = await generateSummary(threadMsgs, deal);
        if (!summaryResult) continue;

        await writeToPipedrive(deal.id, summaryResult, options.dryRun);
        totalSummaries++;
      }
    }
  } catch (error) {
    console.error(`Błąd: ${error.message}`);
    process.exit(1);
  }

  const prefix = options.dryRun ? '[DRY RUN] ' : '';
  console.log(`\n${prefix}Backfill zakończony. Zapisano ${totalSummaries} podsumowań.`);
  process.exit(0);
}

main();
