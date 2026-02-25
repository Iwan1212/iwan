// src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Jesteś Iwan — przyjazny asystent AI zespołu.
Odpowiadaj zwięźle, konkretnie, po polsku.
Nie wymyślaj informacji których nie znasz.
Jeśli nie wiesz — powiedz że nie wiesz.`;

// Wyślij wiadomość do Claude i zwróć odpowiedź
async function askClaude(userMessage) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z historią rozmowy
async function askClaudeWithHistory(messages) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: messages,
  });
  return response.content[0].text;
}

// Wyślij wiadomość do Claude z kontekstem ze Slacka
async function askClaudeWithContext(userMessage, slackContext) {
  const systemWithContext = SYSTEM_PROMPT + slackContext;
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemWithContext,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

module.exports = { askClaude, askClaudeWithHistory, askClaudeWithContext };
