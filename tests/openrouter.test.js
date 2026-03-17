// Testy fallbacku OpenRouter
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.OPENROUTER_API_KEY = 'test-key';

const { isOpenRouterEnabled, askOpenRouter, callOpenRouter } = require('../src/services/openrouter');

beforeEach(() => {
  mockFetch.mockReset();
});

describe('isOpenRouterEnabled', () => {
  it('zwraca true gdy klucz jest ustawiony', () => {
    expect(isOpenRouterEnabled()).toBe(true);
  });
});

describe('askOpenRouter', () => {
  it('wysyła zapytanie do OpenRouter API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from OpenRouter' } }],
      }),
    });

    const result = await askOpenRouter(
      [{ role: 'user', content: 'Hi' }],
      'You are helpful',
    );

    expect(result).toBe('Hello from OpenRouter');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe('system');
  });

  it('rzuca błąd przy nieudanym zapytaniu', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(askOpenRouter([{ role: 'user', content: 'Hi' }]))
      .rejects.toThrow('OpenRouter API: 500');
  });
});

describe('callOpenRouter', () => {
  it('zwraca znormalizowaną LLMResponse', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OpenRouter response' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    const result = await callOpenRouter({
      tier: 'smart',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.text).toBe('OpenRouter response');
    expect(result.provider).toBe('openrouter');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
  });

  it('używa modelu Haiku dla tier fast', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });

    const result = await callOpenRouter({
      tier: 'fast',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.model).toContain('haiku');
  });
});
