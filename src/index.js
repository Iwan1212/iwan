// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');
const { askClaude, askClaudeWithHistory, askClaudeWithContext } = require('./services/claude');
const { searchSlackHistory, buildContextFromMessages } = require('./services/search');
const { searchNotion, buildContextFromNotion } = require('./services/notion');
const { searchWorkforce, buildContextFromWorkforce, shouldQueryWorkforce } = require('./services/workforce');
const { askClaudeWithTools } = require('./services/claudeTools');
const { askHaiku } = require('./services/claudeHaiku');
const { createToolExecutors } = require('./services/toolExecutor');

const useTools = process.env.ENABLE_TOOL_USE === 'true';
const { setupWorkforceAlerts, setupWeeklySummary } = require('./services/workforceAlerts');
const { setupDealDigest } = require('./services/dealDigest');
const { validateMessage } = require('./services/validate');
const { checkRateLimit } = require('./services/ratelimit');
const { classifyMessage } = require('./services/classify');
const { saveMessage, getHistory } = require('./services/memory');
const { setupCrawler } = require('./crawler/listener');
const { setupBackfillTrigger } = require('./crawler/backfillTrigger');
const { toSlackMarkdown } = require('./services/format');
const { resolveUserNames, getUserName } = require('./services/users');
const { getCompanyContext } = require('./services/context');
const { setupSlashCommand } = require('./handlers/slash');
const { setupApprovalActions } = require('./handlers/approvalFlow');

// Inicjalizacja aplikacji Slack w trybie Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Helper: zapisz, sformatuj, wyślij odpowiedź i zmień reakcje
async function sendReply({ app, event, threadTs, tekst, odpowiedz, mentionedUsers, say }) {
  await saveMessage(event.channel, threadTs, event.user, 'user', tekst);
  await saveMessage(event.channel, threadTs, 'iwan', 'assistant', odpowiedz);
  let sformatowana = toSlackMarkdown(odpowiedz);
  for (const [name, userId] of mentionedUsers) {
    const nameRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    sformatowana = sformatowana.replace(nameRegex, `<@${userId}>`);
  }
  await say({ text: sformatowana, thread_ts: threadTs });
  try {
    await app.client.reactions.remove({ channel: event.channel, name: 'eyes', timestamp: event.ts });
    await app.client.reactions.add({ channel: event.channel, name: 'white_check_mark', timestamp: event.ts });
  } catch (_) {}
}

// Obsługa wzmianek @Iwan — z guardrails
app.event('app_mention', async ({ event, say, context }) => {
  const botUserId = context.botUserId || '';

  // Zamień mentions na imiona: <@U123|Jan> → Jan, <@UBOT> → usuń, <@UINNY> → imię
  let tekst = event.text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '$1');  // <@U123|Jan> → Jan

  // Zamień pozostałe mentions: bota usuń, innych zamień na imię
  const mentionPattern = /<@([A-Z0-9]+)>/g;
  const mentions = [...tekst.matchAll(mentionPattern)];
  const mentionedUsers = new Map(); // imię → userId (do @mention w odpowiedzi)
  for (const match of mentions) {
    const userId = match[1];
    if (userId === botUserId) {
      tekst = tekst.replace(match[0], '');
    } else {
      const name = await getUserName(app, userId);
      tekst = tekst.replace(match[0], name);
      mentionedUsers.set(name, userId);
    }
  }
  tekst = tekst.trim();

  // 0. Reakcja 👀 — przetwarzam
  try {
    await app.client.reactions.add({ channel: event.channel, name: 'eyes', timestamp: event.ts });
  } catch (_) {}

  // 1. Walidacja
  const walidacja = validateMessage(tekst);
  if (!walidacja.valid) { await say(walidacja.error); return; }

  // 2. Rate limit
  const limit = checkRateLimit(event.user);
  if (!limit.allowed) { await say(limit.error); return; }

  // 3. Klasyfikacja (pomiń dla zapytań workforce — krótkie frazy mogą być błędnie klasyfikowane)
  let kategoria = null;
  if (!shouldQueryWorkforce(tekst)) {
    kategoria = await classifyMessage(tekst);
    if (kategoria === 'spam') { await say('Nie mogę pomóc z tym zapytaniem.'); return; }
  }

  // 4. Thread ID — event.thread_ts dla odpowiedzi w wątku, event.ts dla nowych wiadomości
  const threadTs = event.thread_ts || event.ts;

  // 4.5. Smart routing: small-talk bez obrazków → szybka odpowiedź Haiku
  const hasImages = event.files && event.files.some(f => (f.mimetype || '').startsWith('image/'));
  if (kategoria === 'small-talk' && !hasImages) {
    const userName = await getUserName(app, event.user);
    let odpowiedz;
    try {
      odpowiedz = await askHaiku([{ role: 'user', content: tekst }], userName);
    } catch (error) {
      console.error('[iwan] Błąd Haiku:', error.message);
      odpowiedz = 'Stay hard! 💪';
    }
    await sendReply({ app, event, threadTs, tekst, odpowiedz, mentionedUsers, say });
    return;
  }

  // 5-7. Dwa tryby: tool use (Claude decyduje co odpytać) lub legacy (wszystko na raz)
  const [userName, companyContext] = await Promise.all([
    getUserName(app, event.user),
    getCompanyContext(tekst),
  ]);
  const historia = await getHistory(event.channel, threadTs);
  const messages = historia.map(msg => ({ role: msg.role, content: msg.content }));

  // Obsługa obrazków — pobierz i dodaj jako vision content (max 4MB)
  const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const imageBlocks = [];
  if (event.files && event.files.length > 0) {
    for (const file of event.files.slice(0, 3)) {
      const mimeType = file.mimetype || '';
      if (ALLOWED_TYPES.includes(mimeType) && (file.size || 0) <= MAX_IMAGE_SIZE) {
        try {
          const res = await fetch(file.url_private_download || file.url_private, {
            headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
          });
          if (!res.ok) { console.log(`[iwan] Nie udało się pobrać pliku: ${res.status}`); continue; }
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          // Sprawdź magic bytes: PNG (89 50 4E 47), JPEG (FF D8 FF), GIF (47 49 46), WEBP (52 49 46 46)
          const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
          const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
          const isGif = bytes[0] === 0x47 && bytes[1] === 0x49;
          const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49;
          if (!isPng && !isJpeg && !isGif && !isWebp) {
            console.log(`[iwan] Plik ${file.name} nie jest obrazkiem (magic: ${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)})`);
            continue;
          }
          // Użyj faktycznego typu na podstawie magic bytes
          const detectedType = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isGif ? 'image/gif' : 'image/webp';
          console.log(`[iwan] Obrazek: ${file.name}, ${detectedType}, ${buffer.byteLength} bajtów`);
          const base64 = Buffer.from(buffer).toString('base64');
          imageBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: detectedType, data: base64 },
          });
        } catch (e) { console.log(`[iwan] Błąd pobierania obrazka: ${e.message}`); }
      } else if (mimeType.startsWith('image/')) {
        console.log(`[iwan] Pominięto obrazek: ${file.name}, ${mimeType}, ${file.size} bajtów (za duży lub nieobsługiwany typ)`);
      }
    }
  }

  if (imageBlocks.length > 0) {
    const content = [...imageBlocks, { type: 'text', text: tekst || 'Co widzisz na tym obrazku?' }];
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: tekst });
  }

  let odpowiedz;
  try {
    if (useTools) {
      // Nowy flow: Claude decyduje które źródła odpytać
      const executors = createToolExecutors(app, event.channel, threadTs);
      odpowiedz = await askClaudeWithTools(messages, executors, userName, companyContext);
    } else {
      // Legacy flow: wszystkie źródła odpytywane równolegle
      const [wyniki, notionPages, workforceData] = await Promise.all([
        searchSlackHistory(tekst, event.channel, threadTs),
        searchNotion(tekst),
        searchWorkforce(tekst),
      ]);
      await resolveUserNames(app, wyniki);
      const slackKontekst = buildContextFromMessages(wyniki);
      const notionKontekst = await buildContextFromNotion(notionPages);
      const workforceKontekst = buildContextFromWorkforce(workforceData);
      const kontekst = slackKontekst + notionKontekst + workforceKontekst;

      if (kontekst) {
        odpowiedz = await askClaudeWithContext(messages, kontekst, userName, companyContext);
      } else if (messages.length > 1) {
        odpowiedz = await askClaudeWithHistory(messages, userName, companyContext);
      } else {
        odpowiedz = await askClaude(tekst, userName, companyContext);
      }
    }
  } catch (error) {
    console.error('[iwan] Błąd Claude API:', error.message);
    // Retry bez obrazków jeśli to błąd przetwarzania obrazu
    if (imageBlocks.length > 0 && error.message.includes('image')) {
      console.log('[iwan] Retry bez obrazków...');
      messages[messages.length - 1] = { role: 'user', content: tekst || 'Nie udało się przetworzyć obrazka.' };
      try {
        const executors = createToolExecutors(app, event.channel, threadTs);
        odpowiedz = await askClaudeWithTools(messages, executors, userName, companyContext);
      } catch (e2) {
        odpowiedz = 'Przepraszam, coś poszło nie tak. Spróbuj ponownie.';
      }
    } else {
      odpowiedz = 'Przepraszam, coś poszło nie tak. Spróbuj ponownie.';
    }
  }

  // 8-10. Zapisz, sformatuj, wyślij odpowiedź i zmień reakcje
  await sendReply({ app, event, threadTs, tekst, odpowiedz, mentionedUsers, say });
});

// Włącz slash command /iwan
setupSlashCommand(app);

// Włącz crawler wiadomości
setupCrawler(app);

// Włącz auto-backfill przy dołączeniu do kanału (z approval flow)
setupBackfillTrigger(app);

// Włącz approval actions (zatwierdzanie/odrzucanie kanałów)
setupApprovalActions(app);

// Włącz alerty i weekly summary z Workforce Planner
setupWorkforceAlerts(app);
setupWeeklySummary(app);

// Włącz daily deal digest (Slack → Pipedrive)
setupDealDigest(app);

// Start bota
(async () => {
  await app.start();

  // Włącz tryb proaktywny (po starcie, bo potrzebuje API)
  const { setupProactive } = require('./proactive/setup');
  await setupProactive(app);

  console.log('🤖 Iwan działa w Socket Mode!');
})();

// Health check — loguj co 5 minut
setInterval(() => {
  console.log(`💚 Iwan żyje — ${new Date().toISOString()}`);
}, 5 * 60 * 1000);
