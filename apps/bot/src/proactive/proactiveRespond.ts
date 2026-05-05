// src/proactive/proactiveRespond.ts — generowanie i wysyłanie proaktywnej odpowiedzi
import { askClaudeProactive } from './proactiveClaudeCall.js';
import { createAuthorizedExecutors } from '../services/authorizedExecutor.js';
import { toSlackMarkdown } from '../services/format.js';
import { saveMessage } from '../services/memory.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Zbuduj wiadomości dla Claude z kontekstem rozmowy
export function buildProactiveMessages(conversationText: string, triggerReason: string) {
  return [
    {
      role: 'user',
      content: `Rozmowa na kanale (wtrąć się jeśli masz coś wartościowego do dodania):

Powód: ${triggerReason}

${conversationText}`,
    },
  ];
}

// Wygeneruj i wyślij proaktywną odpowiedź na Slack
export async function sendProactiveResponse(app: SlackApp, channelId: string, threadTs: string, conversationText: string, triggerReason: string, companyContext: string, channelName?: string): Promise<string | null> {
  const messages = buildProactiveMessages(conversationText, triggerReason);
  const executors = createAuthorizedExecutors(app, channelId, threadTs, 'IWAN_PROACTIVE');

  const odpowiedz = await askClaudeProactive(messages, executors, companyContext, channelName);
  if (!odpowiedz || !odpowiedz.trim()) return null;

  const sformatowana = toSlackMarkdown(odpowiedz);

  // Wyślij na Slack (w wątku jeśli threadTs, inaczej na kanał)
  const postArgs: Record<string, string> = {
    channel: channelId,
    text: sformatowana,
  };
  if (threadTs) {
    postArgs.thread_ts = threadTs;
  }

  await app.client.chat.postMessage(postArgs);

  // Zapisz w pamięci
  await saveMessage(channelId, threadTs || null, 'iwan', 'assistant', odpowiedz);

  console.log(`[proactive] Wysłano odpowiedź na ${channelId}${threadTs ? ` (wątek ${threadTs})` : ''}`);
  return odpowiedz;
}
