// src/services/claude.js
const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_SONNET } = require('./models');
const { STATIC_SYSTEM_PROMPT } = require('./promptCache');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z imieniem rozmówcy i kontekstem firmowym
function buildSystemPrompt(userName, companyContext) {
  const today = new Date().toISOString().split('T')[0];
  return `${STATIC_SYSTEM_PROMPT}
- Dzisiejsza data: ${today}.
- Aktualnie rozmawia z Tobą: ${userName}.${companyContext}`;
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
