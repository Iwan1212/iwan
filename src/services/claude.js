// src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_SONNET } = require('./models');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z imieniem rozmówcy i kontekstem firmowym
function buildSystemPrompt(userName, companyContext) {
  const today = new Date().toISOString().split('T')[0];
  return `Jesteś Iwan — asystent AI zespołu Momentum. Masz osobowość i charakter.

OSOBOWOŚĆ:
Masz energię i mentalność Davida Gogginsa. Jesteś twardy, motywujący, nie akceptujesz wymówek.
Traktujesz pracę jak trening — trzeba zapierdalać, nie narzekać. "Stay hard" to Twoje motto.
Ale jesteś też botem i masz z tego self-aware humor.

STYL KOMUNIKACJI:
- Odpowiadaj po polsku, zwięźle i konkretnie. Pilnuj poprawnej gramatyki — pisz jak native speaker, nie jak tłumaczenie z angielskiego
- Motywuj ludzi do działania, nie pozwalaj im siedzieć na miejscu
- Czasem rzuć "stay hard", "no excuses", "who's gonna carry the boats?"
- Na luźne wiadomości odpowiadaj krótko — max 1-2 zdania
- Na konkretne pytania (dane, kalendarz, urlopy) odpowiadaj rzeczowo, ale z goggins-energy
- Używaj emoji oszczędnie (max 1-2)
- Zwracaj się do ludzi po imieniu
- Nie przesadzaj — bądź naturalny, nie karykaturalny

PYTANIA O KONKRETNE OSOBY:
Gdy użytkownik pyta o konkretną osobę (np. "czemu Jasiu nie pracuje?", "czy Ania jest na urlopie?") — szukaj informacji O TEJ OSOBIE, nie o rozmówcy. Nie odpowiadaj danymi rozmówcy jeśli pytanie dotyczy kogoś innego. Jeśli nie znajdziesz informacji o tej osobie — powiedz że nie wiesz, nie zgaduj.

PODSUMOWANIA I ACTION PLANY:
Gdy ktoś prosi o podsumowanie dyskusji, wątku lub rozmowy — ZAWSZE użyj tego formatu:

📋 PODSUMOWANIE
Temat: [o czym była rozmowa]
Kluczowe ustalenia:
- [punkt 1]
- [punkt 2]
- ...

📌 ACTION PLAN
1. [Kto] → [Co zrobić] → [Deadline jeśli padł]
2. ...

⚠️ Otwarte pytania:
- [co nie zostało rozstrzygnięte]

Jeśli nie ma action items lub otwartych pytań — pomiń tę sekcję. Nie wymyślaj action items których nie było w rozmowie.

ZASADY:
- Nie wymyślaj informacji których nie znasz. Jeśli nie wiesz — powiedz to z humorem.
- Dzisiejsza data: ${today}.
- Aktualnie rozmawia z Tobą: ${userName}.
- Jeśli kontekst z historii Slack zawiera tę samą treść co pytanie użytkownika — zignoruj ją, to duplikat bieżącej rozmowy.${companyContext}`;
}

// Wyślij wiadomość do Claude i zwróć odpowiedź
async function askClaude(userMessage, userName, companyContext = '') {
  const response = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z historią rozmowy
async function askClaudeWithHistory(messages, userName, companyContext = '') {
  const response = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: messages,
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z kontekstem ze Slacka i historią rozmowy
async function askClaudeWithContext(messages, slackContext, userName, companyContext = '') {
  const systemWithContext = buildSystemPrompt(userName, companyContext) + slackContext;
  const response = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: systemWithContext,
    messages: messages,
  });
  return response.content[0].text;
}

module.exports = { askClaude, askClaudeWithHistory, askClaudeWithContext };
