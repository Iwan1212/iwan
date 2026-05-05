// src/proactive/engine.ts — główny orkiestrator trybu proaktywnego
import { isProactiveChannel } from './channelResolver.js';
import { trackThreadMessage, markThreadResponded } from './threadTracker.js';
import { trackChannelMessage, markChannelResponded } from './channelCounter.js';
import { detectTopics } from './topicDetector.js';
import { shouldIwanRespond } from './proactiveClassify.js';
import { checkProactiveRateLimit, recordProactiveResponse } from './proactiveRatelimit.js';
import { sendProactiveResponse } from './proactiveRespond.js';
import { getCompanyContext } from '../services/context.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface SlackMessage {
  channel: string;
  thread_ts?: string;
  ts: string;
  text?: string;
}

// Set zapobiegający race conditions (dwa msg w tym samym wątku naraz)
const inProgress = new Set<string>();

// Zbierz wszystkie triggery dla wiadomości
export function collectTriggers(message: SlackMessage, channelId: string): string[] {
  const triggers: string[] = [];

  // 1. Thread trigger — wątek z >= N wiadomościami
  if (message.thread_ts) {
    const threadResult = trackThreadMessage(channelId, message.thread_ts);
    if (threadResult.triggered) {
      triggers.push('active_thread');
    }
  }

  // 2. Channel counter — co N wiadomości na kanale (tylko nie-wątkowe)
  if (!message.thread_ts) {
    const channelResult = trackChannelMessage(channelId);
    if (channelResult.triggered) {
      triggers.push('channel_interval');
    }
  }

  // 3. Topic detection — wykrycie tematu
  const topics = detectTopics(message.text || '');
  if (topics.length > 0) {
    triggers.push(`topic:${topics.join(',')}`);
  }

  return triggers;
}

// Pobierz kontekst rozmowy (ostatnie wiadomości z wątku lub kanału)
export async function getConversationContext(app: SlackApp, message: SlackMessage): Promise<string> {
  try {
    if (message.thread_ts) {
      const result = await app.client.conversations.replies({
        channel: message.channel,
        ts: message.thread_ts,
        limit: 20,
      });
      const msgs = result.messages || [];
      return msgs.map((m: Record<string, string>) => `${m.user || 'bot'}: ${m.text || ''}`).join('\n').substring(0, 3000);
    }

    // Kanał — ostatnie 10 wiadomości
    const result = await app.client.conversations.history({
      channel: message.channel,
      limit: 10,
    });
    const msgs = (result.messages || []).reverse();
    return msgs.map((m: Record<string, string>) => `${m.user || 'bot'}: ${m.text || ''}`).join('\n').substring(0, 3000);
  } catch (error) {
    console.error('[proactive] Błąd pobierania kontekstu:', (error as Error).message);
    return message.text || '';
  }
}

// Główny pipeline ewaluacji wiadomości
export async function evaluateMessage(app: SlackApp, message: SlackMessage, channelName: string): Promise<void> {
  const channelId = message.channel;

  // 1. Czy kanał jest proaktywny?
  if (!isProactiveChannel(channelId)) return;

  // 2. Pomijaj wiadomości z @mentions (obsługiwane przez app_mention handler)
  if (message.text && /<@[A-Z0-9]+>/.test(message.text)) return;

  // 3. Zbierz triggery
  const triggers = collectTriggers(message, channelId);
  if (triggers.length === 0) return;

  const triggerReason = triggers.join(', ');
  console.log(`[proactive] Trigger: ${triggerReason} na #${channelName}`);

  // 4. Zapobiegaj race conditions (parent i replies mają ten sam lock)
  const lockKey = `${channelId}:${message.thread_ts || message.ts}`;
  if (inProgress.has(lockKey)) return;
  inProgress.add(lockKey);

  try {
    // 5. Pobierz kontekst rozmowy
    const conversationText = await getConversationContext(app, message);

    // 6. Haiku gatekeeper — czy się odezwać?
    const decision = await shouldIwanRespond(conversationText, triggerReason);
    if (!decision.should) {
      console.log(`[proactive] Gatekeeper: NIE (${decision.confidence}, ${decision.reason})`);
      return;
    }
    console.log(`[proactive] Gatekeeper: TAK (${decision.confidence}, ${decision.reason})`);

    // 7. Globalny rate limit
    const rateLimit = checkProactiveRateLimit();
    if (!rateLimit.allowed) {
      console.log(`[proactive] Rate limit: ${rateLimit.count} odpowiedzi/h — pomijam`);
      return;
    }

    // 8. Wygeneruj i wyślij odpowiedź (ZAWSZE w wątku — message.ts jako fallback)
    const companyContext = await getCompanyContext(message.text || '');
    const threadTs = message.thread_ts || message.ts;
    await sendProactiveResponse(app, channelId, threadTs, conversationText, triggerReason, companyContext, channelName);

    // 9. Zaznacz jako obsłużone — zarówno wątek jak i kanał
    recordProactiveResponse();
    markThreadResponded(channelId, threadTs);
    if (!message.thread_ts) {
      markChannelResponded(channelId);
    }
  } catch (error) {
    console.error(`[proactive] Błąd pipeline:`, (error as Error).message);
  } finally {
    inProgress.delete(lockKey);
  }
}

// Eksportuj inProgress do testów
export function _getInProgress(): Set<string> {
  return inProgress;
}
