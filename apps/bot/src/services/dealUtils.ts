// src/services/dealUtils.ts — wspólne funkcje dla modułów deal

// Oczyść odpowiedź LLM z markdown code block i sparsuj JSON
export function cleanLlmJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const cleaned = trimmed.startsWith('```')
    ? trimmed.split('\n').slice(1, -1).join('\n')
    : trimmed;
  return JSON.parse(cleaned);
}

// Z listy deali wybierz otwarte, fallback na wszystkie
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function preferOpenDeals(deals: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = deals.filter((d: any) => d.status === 'open');
  return open.length > 0 ? open : deals;
}

// Grupuj wiadomości po wątkach (thread_ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function groupByThread(messages: any[]): Record<string, any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threads: Record<string, any[]> = {};
  for (const msg of messages) {
    const ts = msg.thread_ts || 'main';
    if (!threads[ts]) threads[ts] = [];
    threads[ts].push(msg);
  }
  return threads;
}
