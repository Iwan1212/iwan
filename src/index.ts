// src/index.ts — punkt wejścia aplikacji Iwan
import 'dotenv/config';
import { App } from '@slack/bolt';
import { askClaude, askClaudeWithHistory, askClaudeWithContext } from './services/claude.js';
import { searchSlackHistory, buildContextFromMessages } from './services/search.js';
import { searchNotion, buildContextFromNotion } from './services/notion.js';
import { searchWorkforce, buildContextFromWorkforce, shouldQueryWorkforce } from './services/workforce.js';
import { askClaudeWithTools } from './services/claudeTools.js';
import { askHaiku } from './services/claudeHaiku.js';
import { createToolExecutors } from './services/toolExecutor.js';

const useTools = process.env.ENABLE_TOOL_USE === 'true';
import { setupWorkforceAlerts, setupWeeklySummary } from './services/workforceAlerts.js';
import { setupDealDigest } from './services/dealDigest.js';
import { validateMessage } from './services/validate.js';
import { checkRateLimit } from './services/ratelimit.js';
import { classifyMessage } from './services/classify.js';
import { saveMessage, getHistory } from './services/memory.js';
import { setupCrawler } from './crawler/listener.js';
import { setupBackfillTrigger } from './crawler/backfillTrigger.js';
import { toSlackMarkdown } from './services/format.js';
import { resolveUserNames, getUserName } from './services/users.js';
import { getCompanyContext } from './services/context.js';
import { setupSlashCommand } from './handlers/slash.js';
import { setupApprovalActions } from './handlers/approvalFlow.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Inicjalizacja aplikacji Slack w trybie Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Helper: zapisz, sformatuj, wyślij odpowiedź i zmień reakcje
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendReply({ app, event, threadTs, tekst, odpowiedz, mentionedUsers, say }: { app: any; event: any; threadTs: string; tekst: string; odpowiedz: string; mentionedUsers: Map<string, string>; say: any }): Promise<void> {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.event('app_mention', async ({ event, say, context }: any) => {
  const botUserId = context.botUserId || '';

  // Zamień mentions na imiona: <@U123|Jan> → Jan, <@UBOT> → usuń, <@UINNY> → imię
  let tekst = event.text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '$1');  // <@U123|Jan> → Jan

  // Zamień pozostałe mentions: bota usuń, innych zamień na imię
  const mentionPattern = /<@([A-Z0-9]+)>/g;
  const mentions = [...tekst.matchAll(mentionPattern)];
  const mentionedUsers = new Map<string, string>(); // imię → userId (do @mention w odpowiedzi)
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
  let kategoria: string | null = null;
  if (!shouldQueryWorkforce(tekst)) {
    kategoria = await classifyMessage(tekst);
    if (kategoria === 'spam') { await say('Nie mogę pomóc z tym zapytaniem.'); return; }
  }

  // 4. Thread ID — event.thread_ts dla odpowiedzi w wątku, event.ts dla nowych wiadomości
  const threadTs = event.thread_ts || event.ts;

  // 4.5. Smart routing: small-talk bez obrazków → szybka odpowiedź Haiku
  const hasImages = event.files && event.files.some((f: { mimetype?: string }) => (f.mimetype || '').startsWith('image/'));
  if (kategoria === 'small-talk' && !hasImages) {
    const userName = await getUserName(app, event.user);
    let odpowiedz: string;
    try {
      odpowiedz = await askHaiku([{ role: 'user', content: tekst }], userName);
    } catch (error) {
      console.error('[iwan] Błąd Haiku:', (error as Error).message);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = historia.map(msg => ({ role: msg.role, content: msg.content }));

  // Obsługa obrazków — pobierz i dodaj jako vision content (max 4MB)
  const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imageBlocks: any[] = [];
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
        } catch (e) { console.log(`[iwan] Błąd pobierania obrazka: ${(e as Error).message}`); }
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

  let odpowiedz: string;
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
    console.error('[iwan] Błąd Claude API:', (error as Error).message);
    // Retry bez obrazków jeśli to błąd przetwarzania obrazu
    if (imageBlocks.length > 0 && (error as Error).message.includes('image')) {
      console.log('[iwan] Retry bez obrazków...');
      messages[messages.length - 1] = { role: 'user', content: tekst || 'Nie udało się przetworzyć obrazka.' };
      try {
        const executors = createToolExecutors(app, event.channel, threadTs);
        odpowiedz = await askClaudeWithTools(messages, executors, userName, companyContext);
      } catch (_e2) {
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
  const { setupProactive } = await import('./proactive/setup.js');
  await setupProactive(app);

  console.log('🤖 Iwan działa w Socket Mode!');
})();

// Health check — loguj co 5 minut
setInterval(() => {
  console.log(`💚 Iwan żyje — ${new Date().toISOString()}`);
}, 5 * 60 * 1000);
