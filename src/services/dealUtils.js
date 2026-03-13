// src/services/dealUtils.js — wspólne funkcje dla modułów deal

// Oczyść odpowiedź LLM z markdown code block i sparsuj JSON
function cleanLlmJson(text) {
  const trimmed = text.trim();
  const cleaned = trimmed.startsWith('```')
    ? trimmed.split('\n').slice(1, -1).join('\n')
    : trimmed;
  return JSON.parse(cleaned);
}

// Z listy deali wybierz otwarte, fallback na wszystkie
function preferOpenDeals(deals) {
  const open = deals.filter(d => d.status === 'open');
  return open.length > 0 ? open : deals;
}

// Grupuj wiadomości po wątkach (thread_ts)
function groupByThread(messages) {
  const threads = {};
  for (const msg of messages) {
    const ts = msg.thread_ts || 'main';
    if (!threads[ts]) threads[ts] = [];
    threads[ts].push(msg);
  }
  return threads;
}

module.exports = { cleanLlmJson, preferOpenDeals, groupByThread };
