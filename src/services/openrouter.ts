// src/services/openrouter.ts — fallback LLM przez OpenRouter API
import type { ChatMessage } from '../types/index.js';
import type { LLMRequest, LLMResponse, ModelTier } from './llm.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-20250514';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Mapowanie tier → model OpenRouter
const OR_MODEL_MAP: Record<ModelTier, string> = {
  fast: 'anthropic/claude-haiku-4-5-20251001',
  smart: 'anthropic/claude-sonnet-4-5-20250929',
};

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

// Zunifikowany interfejs dla llm.ts — wywołaj OpenRouter z LLMRequest
export async function callOpenRouter(req: LLMRequest): Promise<LLMResponse> {
  const model = OR_MODEL_MAP[req.tier];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiMessages: any[] = [];

  // System prompt — skonwertuj CacheBlock[] lub string na string
  if (req.system) {
    const systemText = Array.isArray(req.system)
      ? (req.system as { text: string }[]).map(b => b.text).join('\n')
      : req.system as string;
    apiMessages.push({ role: 'system', content: systemText });
  }

  // Messages — normalizuj do OpenAI format
  for (const msg of req.messages as { role: string; content: unknown }[]) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    apiMessages.push({ role: msg.role, content });
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      max_tokens: req.maxTokens || 1024,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter API: ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  const text = data.choices?.[0]?.message?.content || '';

  return {
    text,
    stopReason: data.choices?.[0]?.finish_reason || 'end_turn',
    content: [{ type: 'text', text }],
    usage: {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    },
    provider: 'openrouter',
    model,
  };
}
