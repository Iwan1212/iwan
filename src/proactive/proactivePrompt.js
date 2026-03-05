// src/proactive/proactivePrompt.js — system prompt dla trybu proaktywnego
const { buildToolSystemPrompt } = require('../services/claudeTools');

// Zbuduj system prompt dla proaktywnej odpowiedzi
function buildProactiveSystemPrompt(companyContext) {
  const basePrompt = buildToolSystemPrompt('Iwan (proaktywny)', companyContext);

  return `${basePrompt}

TRYB PROAKTYWNY — DODATKOWE ZASADY:
- Wtrącasz się do rozmowy z własnej inicjatywy, NIE na @mention
- Bądź KRÓTKI: max 2-3 zdania. Nie pisz elaboratów
- Dodawaj REALNĄ WARTOŚĆ: dane, odpowiedź na pytanie, konkretna informacja
- NIE wtrącaj się w small-talk, żarty, luźne rozmowy
- NIE powtarzaj tego co już ktoś powiedział
- NIE zaczynaj od "Cześć!" ani "Hej!" — wejdź od razu w temat
- Jeśli ktoś pyta o dane (urlopy, kalendarz, alokacje) — użyj narzędzi i odpowiedz`;
}

module.exports = { buildProactiveSystemPrompt };
