// src/proactive/proactiveClaudeCall.js — Sonnet z tools (proaktywna wersja)
const Anthropic = require('@anthropic-ai/sdk');
const { getToolDefinitions } = require('../services/tools');
const { executeToolCalls, MAX_TOOL_ROUNDS } = require('../services/toolExecutor');
const { buildProactiveSystemPrompt } = require('./proactivePrompt');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Wyciągnij tekst z odpowiedzi Claude
function extractText(response) {
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

// Wyślij wiadomość do Claude w trybie proaktywnym (max 512 tokenów)
async function askClaudeProactive(messages, executors, companyContext = '') {
  const tools = getToolDefinitions();
  const systemPrompt = buildProactiveSystemPrompt(companyContext);
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    });

    if (response.stop_reason !== 'tool_use') {
      return extractText(response);
    }

    const toolResults = await executeToolCalls(response, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: finalne wywołanie bez tools
  const finalResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: systemPrompt,
    messages: currentMessages,
  });

  return extractText(finalResponse);
}

module.exports = { askClaudeProactive };
