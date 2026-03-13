// Testy fallbacku OpenRouter
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.OPENROUTER_API_KEY = 'test-key';

const { isOpenRouterEnabled, askOpenRouter, withFallback } = require('../src/services/openrouter');

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

describe('withFallback', () => {
  it('zwraca wynik primary gdy działa', async () => {
    const primary = jest.fn().mockResolvedValue('primary result');
    const result = await withFallback(primary, [], '', 1024);
    expect(result).toBe('primary result');
  });

  it('fallback do OpenRouter gdy primary rzuca błąd', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('Anthropic down'));
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'fallback result' } }],
      }),
    });

    const result = await withFallback(
      primary,
      [{ role: 'user', content: 'test' }],
      'system prompt',
      1024,
    );

    expect(result).toBe('fallback result');
  });

  it('rzuca oryginalny błąd gdy oba failują', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      withFallback(primary, [{ role: 'user', content: 'test' }], '', 1024)
    ).rejects.toThrow('Primary failed');
  });
});
