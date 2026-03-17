// src/services/claudeTools.ts — Claude z pętlą tool use i prompt caching

import { anthropic } from './anthropicClient.js';
import { MODEL_SONNET } from './models.js';
import { getToolDefinitionsWithCache } from './tools.js';
import { buildCachedToolSystemPrompt } from './promptCache.js';
import { executeToolCalls, MAX_TOOL_ROUNDS } from './toolExecutor.js';
import type { ToolExecutors } from '../types/index.js';

interface ContentBlock {
  type: string;
  text?: string;
}

interface MessageResponse {
  content: ContentBlock[];
  stop_reason: string | null;
}

// Wyciągnij tekst z odpowiedzi Claude (text bloki)
export function extractText(response: MessageResponse): string {
  const textBlocks = response.content.filter((b: ContentBlock) => b.type === 'text');
  return textBlocks.map((b: ContentBlock) => b.text || '').join('');
}

// Wyślij wiadomość do Claude z narzędziami i pętlą tool use
export async function askClaudeWithTools(messages: unknown[], executors: ToolExecutors, userName: string, companyContext = ''): Promise<string> {
  const tools = getToolDefinitionsWithCache();
  const systemPrompt = buildCachedToolSystemPrompt(userName, companyContext);
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: systemPrompt as unknown as string,
      tools: tools as unknown as Parameters<typeof anthropic.messages.create>[0]['tools'],
      messages: currentMessages as Parameters<typeof anthropic.messages.create>[0]['messages'],
    });

    // Claude nie chce wołać narzędzi — zwróć tekst
    if (response.stop_reason !== 'tool_use') {
      return extractText(response as unknown as MessageResponse);
    }

    // Claude chce wołać narzędzia — wykonaj i dodaj wyniki
    const toolResults = await executeToolCalls(response as unknown as MessageResponse, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: po max rounds — finalne wywołanie BEZ tools
  const finalResponse = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: systemPrompt as unknown as string,
    messages: currentMessages as Parameters<typeof anthropic.messages.create>[0]['messages'],
  });

  return extractText(finalResponse as unknown as MessageResponse);
}
