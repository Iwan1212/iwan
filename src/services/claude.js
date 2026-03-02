// src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z imieniem rozmówcy
function buildSystemPrompt(userName) {
  return `Jesteś Iwan — przyjazny asystent AI zespołu.
Odpowiadaj zwięźle, konkretnie, po polsku.
Nie wymyślaj informacji których nie znasz.
Jeśli nie wiesz — powiedz że nie wiesz.
Aktualnie rozmawia z Tobą: ${userName}.
Jeśli kontekst z historii Slack zawiera tę samą treść co pytanie użytkownika — zignoruj ją, to duplikat bieżącej rozmowy.`;
}

// Wyślij wiadomość do Claude i zwróć odpowiedź
async function askClaude(userMessage, userName) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(userName),
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z historią rozmowy
async function askClaudeWithHistory(messages, userName) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(userName),
    messages: messages,
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z kontekstem ze Slacka i historią rozmowy
async function askClaudeWithContext(messages, slackContext, userName) {
  const systemWithContext = buildSystemPrompt(userName) + slackContext;
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemWithContext,
    messages: messages,
  });
  return response.content[0].text;
}

module.exports = { askClaude, askClaudeWithHistory, askClaudeWithContext };
