// src/services/claudeTools.ts — Claude z pętlą tool use i prompt caching

import { createMessage } from './llm.js';
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
  stopReason: string | null;
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
    const response = await createMessage({
      tier: 'smart',
      maxTokens: 1024,
      system: systemPrompt as unknown as string,
      tools: tools as unknown[],
      messages: currentMessages as unknown[],
    });

    // Claude nie chce wołać narzędzi — zwróć tekst
    if (response.stopReason !== 'tool_use') {
      return extractText(response as unknown as MessageResponse);
    }

    // Claude chce wołać narzędzia — wykonaj i dodaj wyniki
    const toolResults = await executeToolCalls(response as unknown as { content: ContentBlock[]; stop_reason: string | null }, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: po max rounds — finalne wywołanie BEZ tools
  const finalResponse = await createMessage({
    tier: 'smart',
    maxTokens: 1024,
    system: systemPrompt as unknown as string,
    messages: currentMessages as unknown[],
  });

  return extractText(finalResponse as unknown as MessageResponse);
}
