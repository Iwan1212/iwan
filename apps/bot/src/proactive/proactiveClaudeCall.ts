// src/proactive/proactiveClaudeCall.ts — Sonnet z tools i prompt caching (proaktywna wersja)
import { createMessage } from '../services/llm.js';
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
    const response = await createMessage({
      tier: 'smart',
      maxTokens: 512,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    });

    if (response.stopReason !== 'tool_use') {
      return extractText(response as any);
    }

    const toolResults = await executeToolCalls(response as any, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: finalne wywołanie bez tools
  const finalResponse = await createMessage({
    tier: 'smart',
    maxTokens: 512,
    system: systemPrompt,
    messages: currentMessages,
  });

  return extractText(finalResponse as any);
}
