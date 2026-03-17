// src/services/llm.ts — zunifikowany interfejs LLM z retry i fallbackiem
import { anthropic } from './anthropicClient.js';
import { MODEL_MAP } from './models.js';
import { logError } from './errors.js';

export type ModelTier = 'fast' | 'smart';

export interface LLMRequest {
  tier: ModelTier;
  messages: unknown[];
  system?: string | unknown[];
  maxTokens?: number;
  temperature?: number;
  tools?: unknown[];
}

export interface LLMResponse {
  text: string;
  stopReason: string | null;
  content: unknown[];
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  model: string;
}

// Sprawdź czy błąd kwalifikuje się do retry (5xx, 429, network)
function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('529')) return true;
    if (msg.includes('overloaded')) return true;
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused')) return true;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error as any)?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) return true;
  return false;
}

// Wyciągnij tekst z content bloków Anthropic
function extractTextFromContent(content: unknown[]): string {
  return (content as { type: string; text?: string }[])
    .filter(b => b.type === 'text')
    .map(b => b.text || '')
    .join('');
}

// Normalizuj odpowiedź Anthropic SDK do LLMResponse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeAnthropicResponse(response: any, model: string): LLMResponse {
  return {
    text: extractTextFromContent(response.content),
    stopReason: response.stop_reason || null,
    content: response.content,
    usage: {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    },
    provider: 'anthropic',
    model,
  };
}

// Wywołaj Anthropic SDK
async function callAnthropic(req: LLMRequest, model: string): Promise<LLMResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model,
    max_tokens: req.maxTokens || 1024,
    messages: req.messages,
  };
  if (req.system) params.system = req.system;
  if (req.temperature !== undefined) params.temperature = req.temperature;
  if (req.tools) params.tools = req.tools;

  const response = await anthropic.messages.create(params);
  return normalizeAnthropicResponse(response, model);
}

// Poczekaj ms milisekund
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Główna funkcja — pełna odpowiedź z retry + fallback
export async function createMessage(req: LLMRequest): Promise<LLMResponse> {
  const model = MODEL_MAP[req.tier];

  // 1. Próba Anthropic
  try {
    const result = await callAnthropic(req, model);
    logUsage(result);
    return result;
  } catch (firstError) {
    // 2. Retry jeśli błąd jest retryable
    if (isRetryable(firstError)) {
      console.log(`[llm] Anthropic error, retrying in 1s... (${(firstError as Error).message})`);
      await sleep(1000);
      try {
        const result = await callAnthropic(req, model);
        logUsage(result);
        return result;
      } catch (retryError) {
        // 3. Fallback do OpenRouter
        return await tryFallback(req, firstError as Error);
      }
    }

    // Nie-retryable błąd → fallback
    return await tryFallback(req, firstError as Error);
  }
}

// Fallback do OpenRouter (lazy import żeby uniknąć circular deps)
async function tryFallback(req: LLMRequest, originalError: Error): Promise<LLMResponse> {
  try {
    const { callOpenRouter, isOpenRouterEnabled } = await import('./openrouter.js');
    if (!isOpenRouterEnabled()) throw originalError;

    console.log(`[llm] Anthropic failed (${originalError.message}), falling back to OpenRouter`);
    const result = await callOpenRouter(req);
    logUsage(result);
    return result;
  } catch (fallbackError) {
    if (fallbackError === originalError) throw originalError;
    logError('llm', 'Fallback OpenRouter też nie zadziałał', (fallbackError as Error).message);
    throw originalError;
  }
}

// Loguj zużycie tokenów
function logUsage(result: LLMResponse): void {
  const { provider, model, usage } = result;
  console.log(`[llm] provider=${provider} model=${model} tokens_in=${usage.inputTokens} tokens_out=${usage.outputTokens}`);
}

// Convenience — zwróć tylko tekst
export async function ask(req: Omit<LLMRequest, 'tools'>): Promise<string> {
  const response = await createMessage(req as LLMRequest);
  return response.text;
}
