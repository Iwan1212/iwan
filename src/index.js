// src/index.js — punkt wejścia aplikacji Iwan
require('dotenv').config();
const { App } = require('@slack/bolt');
const { askClaude, askClaudeWithHistory, askClaudeWithContext } = require('./services/claude');
const { searchSlackHistory, buildContextFromMessages } = require('./services/search');
const { searchNotion, buildContextFromNotion } = require('./services/notion');
const { searchWorkforce, buildContextFromWorkforce, shouldQueryWorkforce } = require('./services/workforce');
const { askClaudeWithTools } = require('./services/claudeTools');
const { createToolExecutors } = require('./services/toolExecutor');

const useTools = process.env.ENABLE_TOOL_USE === 'true';
const { setupWorkforceAlerts, setupWeeklySummary } = require('./services/workforceAlerts');
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

// Obsługa wzmianek @Iwan — z guardrails
app.event('app_mention', async ({ event, say }) => {
  const tekst = event.text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '$1')  // <@U123|Jan> → Jan
    .replace(/<@[A-Z0-9]+>/g, '')              // <@UBOT> → usuń mention bota
    .trim();

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

  // 3. Klasyfikacja (pomiń dla zapytań workforce — krótkie frazy typu "team backend" mogą być błędnie klasyfikowane)
  // 3. Klasyfikacja (pomiń dla zapytań workforce — krótkie frazy mogą być błędnie klasyfikowane)
  if (!shouldQueryWorkforce(tekst)) {
    const kategoria = await classifyMessage(tekst);
    if (kategoria === 'spam') { await say('Nie mogę pomóc z tym zapytaniem.'); return; }
  }

  // 4. Thread ID — event.thread_ts dla odpowiedzi w wątku, event.ts dla nowych wiadomości
  const threadTs = event.thread_ts || event.ts;

  // 5-7. Dwa tryby: tool use (Claude decyduje co odpytać) lub legacy (wszystko na raz)
  const [userName, companyContext] = await Promise.all([
    getUserName(app, event.user),
    getCompanyContext(tekst),
  ]);
  const historia = await getHistory(event.channel, threadTs);
  const messages = historia.map(msg => ({ role: msg.role, content: msg.content }));

  // Obsługa obrazków — pobierz i dodaj jako vision content (max 5MB)
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const imageBlocks = [];
  if (event.files && event.files.length > 0) {
    for (const file of event.files.slice(0, 3)) {
      if (file.mimetype && file.mimetype.startsWith('image/') && file.size <= MAX_IMAGE_SIZE) {
        try {
          const res = await fetch(file.url_private, {
            headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` },
          });
          if (!res.ok) continue;
          const buffer = await res.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          imageBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: file.mimetype, data: base64 },
          });
        } catch (_) {}
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
    odpowiedz = 'Przepraszam, coś poszło nie tak. Spróbuj ponownie.';
  }

  // 8. Zapisz rozmowę
  await saveMessage(event.channel, threadTs, event.user, 'user', tekst);
  await saveMessage(event.channel, threadTs, 'iwan', 'assistant', odpowiedz);

  // 9. Sformatuj i wyślij odpowiedź (w wątku)
  const sformatowana = toSlackMarkdown(odpowiedz);
  await say({ text: sformatowana, thread_ts: threadTs });

  // 10. Reakcja ✅ — gotowe, usuń 👀
  try {
    await app.client.reactions.remove({ channel: event.channel, name: 'eyes', timestamp: event.ts });
    await app.client.reactions.add({ channel: event.channel, name: 'white_check_mark', timestamp: event.ts });
  } catch (_) {}
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

// Start bota
(async () => {
  await app.start();
  console.log('🤖 Iwan działa w Socket Mode!');
})();

// Health check — loguj co 5 minut
setInterval(() => {
  console.log(`💚 Iwan żyje — ${new Date().toISOString()}`);
}, 5 * 60 * 1000);
