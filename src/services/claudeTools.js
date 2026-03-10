// src/services/claudeTools.js — Claude z pętlą tool use i prompt caching

const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_SONNET } = require('./models');
const { getToolDefinitionsWithCache } = require('./tools');
const { buildCachedToolSystemPrompt } = require('./promptCache');
const { executeToolCalls, MAX_TOOL_ROUNDS } = require('./toolExecutor');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Wyciągnij tekst z odpowiedzi Claude (text bloki)
function extractText(response) {
  const textBlocks = response.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('');
}

// Wyślij wiadomość do Claude z narzędziami i pętlą tool use
async function askClaudeWithTools(messages, executors, userName, companyContext = '') {
  const tools = getToolDefinitionsWithCache();
  const systemPrompt = buildCachedToolSystemPrompt(userName, companyContext);
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    });

    // Claude nie chce wołać narzędzi — zwróć tekst
    if (response.stop_reason !== 'tool_use') {
      return extractText(response);
    }

    // Claude chce wołać narzędzia — wykonaj i dodaj wyniki
    const toolResults = await executeToolCalls(response, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: po max rounds — finalne wywołanie BEZ tools
  const finalResponse = await client.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: systemPrompt,
    messages: currentMessages,
  });

  return extractText(finalResponse);
}

module.exports = { askClaudeWithTools, extractText };
