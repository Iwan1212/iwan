// src/services/openrouter.ts — fallback LLM przez OpenRouter API
import { logError } from './errors.js';
import type { ChatMessage } from '../types/index.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-20250514';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Sprawdź czy OpenRouter jest skonfigurowany
export function isOpenRouterEnabled(): boolean {
  return Boolean(OPENROUTER_API_KEY);
}

// Wyślij zapytanie do OpenRouter (OpenAI-compatible API)
export async function askOpenRouter(messages: ChatMessage[], systemPrompt = '', maxTokens = 1024, temperature = 0.3): Promise<string> {
  const apiMessages: { role: string; content: string }[] = [];
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content });
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: apiMessages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter API: ${res.status}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

// Wrapper z fallback: próbuj primaryFn, przy błędzie → OpenRouter
export async function withFallback(primaryFn: () => Promise<string>, messages: ChatMessage[], systemPrompt: string, maxTokens: number): Promise<string> {
  try {
    return await primaryFn();
  } catch (error) {
    if (!isOpenRouterEnabled()) throw error;
    console.log(`[openrouter] Anthropic failed (${(error as Error).message}), fallback to OpenRouter`);
    try {
      return await askOpenRouter(messages, systemPrompt, maxTokens);
    } catch (fallbackError) {
      logError('openrouter', 'Fallback też nie zadziałał', (fallbackError as Error).message);
      throw error;
    }
  }
}
