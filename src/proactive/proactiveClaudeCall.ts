// src/proactive/proactiveClaudeCall.ts — Sonnet z tools i prompt caching (proaktywna wersja)
import { anthropic } from '../services/anthropicClient.js';
import { MODEL_SONNET } from '../services/models.js';
import { getToolDefinitionsWithCache } from '../services/tools.js';
import { executeToolCalls, MAX_TOOL_ROUNDS } from '../services/toolExecutor.js';
import { extractText } from '../services/claudeTools.js';
import { buildProactiveSystemPrompt } from './proactivePrompt.js';
import type { ToolExecutors } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageParam = any;

// Wyślij wiadomość do Claude w trybie proaktywnym (max 512 tokenów)
export async function askClaudeProactive(messages: MessageParam[], executors: ToolExecutors, companyContext = ''): Promise<string> {
  const tools = getToolDefinitionsWithCache();
  const systemPrompt = buildProactiveSystemPrompt(companyContext);
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (anthropic.messages.create as any)({
      model: MODEL_SONNET,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalResponse = await (anthropic.messages.create as any)({
    model: MODEL_SONNET,
    max_tokens: 512,
    system: systemPrompt,
    messages: currentMessages,
  });

  return extractText(finalResponse);
}
