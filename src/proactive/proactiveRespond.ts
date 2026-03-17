// src/proactive/proactiveRespond.js — generowanie i wysyłanie proaktywnej odpowiedzi
const { askClaudeProactive } = require('./proactiveClaudeCall');
const { createToolExecutors } = require('../services/toolExecutor');
const { toSlackMarkdown } = require('../services/format');
const { saveMessage } = require('../services/memory');

// Zbuduj wiadomości dla Claude z kontekstem rozmowy
function buildProactiveMessages(conversationText, triggerReason) {
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
async function sendProactiveResponse(app, channelId, threadTs, conversationText, triggerReason, companyContext) {
  const messages = buildProactiveMessages(conversationText, triggerReason);
  const executors = createToolExecutors(app, channelId, threadTs);

  const odpowiedz = await askClaudeProactive(messages, executors, companyContext);
  if (!odpowiedz || !odpowiedz.trim()) return null;

  const sformatowana = toSlackMarkdown(odpowiedz);

  // Wyślij na Slack (w wątku jeśli threadTs, inaczej na kanał)
  const postArgs = {
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

module.exports = { buildProactiveMessages, sendProactiveResponse };
