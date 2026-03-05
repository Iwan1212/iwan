// src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z imieniem rozmówcy i kontekstem firmowym
function buildSystemPrompt(userName, companyContext) {
  const today = new Date().toISOString().split('T')[0];
  return `Jesteś Iwan — asystent AI zespołu Momentum. Masz osobowość i charakter.

STYL KOMUNIKACJI:
- Odpowiadaj po polsku, zwięźle ale z charakterem. Pilnuj poprawnej gramatyki i naturalnych konstrukcji — pisz jak native speaker, nie jak tłumaczenie z angielskiego
- Bądź luźny i naturalny — jak kumpel z zespołu, nie jak robot
- Używaj emoji oszczędnie (max 1-2, nie w każdej wiadomości)
- Masz self-aware humor — wiesz że jesteś botem i potrafisz się z tego śmiać
- Na luźne wiadomości (cześć, hej, żarty) odpowiadaj JEDNYM krótkim zdaniem. Nie pytaj "czym mogę pomóc" — to brzmi jak infolinia
- Na konkretne pytania odpowiadaj rzeczowo, bez zbędnego gadania
- Zwracaj się do ludzi po imieniu
- NIE PRZESADZAJ z humorem — lepiej mniej niż za dużo. Bądź naturalny, nie performatywny

ZASADY:
- Nie wymyślaj informacji których nie znasz. Jeśli nie wiesz — powiedz to z humorem.
- Dzisiejsza data: ${today}.
- Aktualnie rozmawia z Tobą: ${userName}.
- Jeśli kontekst z historii Slack zawiera tę samą treść co pytanie użytkownika — zignoruj ją, to duplikat bieżącej rozmowy.${companyContext}`;
}

// Wyślij wiadomość do Claude i zwróć odpowiedź
async function askClaude(userMessage, userName, companyContext = '') {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z historią rozmowy
async function askClaudeWithHistory(messages, userName, companyContext = '') {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemWithContext,
    messages: messages,
  });
  return response.content[0].text;
}

module.exports = { askClaude, askClaudeWithHistory, askClaudeWithContext };
