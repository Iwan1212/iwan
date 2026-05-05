// src/proactive/proactivePrompt.ts — system prompt dla trybu proaktywnego
import { buildCachedToolSystemPrompt } from '../services/promptCache.js';
import type { CacheBlock } from '../services/promptCache.js';

// Zbuduj system prompt dla proaktywnej odpowiedzi (array bloków z cache_control)
export function buildProactiveSystemPrompt(companyContext: string, channelName?: string): CacheBlock[] {
  const baseBlocks = buildCachedToolSystemPrompt('Iwan (proaktywny)', companyContext, channelName);

  return [
    ...baseBlocks,
    {
      type: 'text' as const,
      text: `\nTRYB PROAKTYWNY — DODATKOWE ZASADY:
- Wtrącasz się do rozmowy z własnej inicjatywy, NIE na @mention
- Bądź KRÓTKI: max 2-3 zdania. Nie pisz elaboratów
- Dodawaj REALNĄ WARTOŚĆ: dane, odpowiedź na pytanie, konkretna informacja
- NIE wtrącaj się w small-talk, żarty, luźne rozmowy
- NIE powtarzaj tego co już ktoś powiedział
- NIE zaczynaj od "Cześć!" ani "Hej!" — wejdź od razu w temat
- Jeśli ktoś pyta o dane (urlopy, kalendarz, alokacje) — użyj narzędzi i odpowiedz`,
    },
  ];
}
