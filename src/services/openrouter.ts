// src/services/openrouter.js — fallback LLM przez OpenRouter API
const { logError } = require('./errors');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4-20250514';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Sprawdź czy OpenRouter jest skonfigurowany
function isOpenRouterEnabled() {
  return Boolean(OPENROUTER_API_KEY);
}

// Wyślij zapytanie do OpenRouter (OpenAI-compatible API)
async function askOpenRouter(messages, systemPrompt = '', maxTokens = 1024, temperature = 0.3) {
  const apiMessages = [];
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
  const data = await res.json();
  return data.choices[0].message.content;
}

// Wrapper z fallback: próbuj primaryFn, przy błędzie → OpenRouter
async function withFallback(primaryFn, messages, systemPrompt, maxTokens) {
  try {
    return await primaryFn();
  } catch (error) {
    if (!isOpenRouterEnabled()) throw error;
    console.log(`[openrouter] Anthropic failed (${error.message}), fallback to OpenRouter`);
    try {
      return await askOpenRouter(messages, systemPrompt, maxTokens);
    } catch (fallbackError) {
      logError('openrouter', 'Fallback też nie zadziałał', fallbackError.message);
      throw error;
    }
  }
}

module.exports = { isOpenRouterEnabled, askOpenRouter, withFallback };
