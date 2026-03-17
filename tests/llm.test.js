// Testy zunifikowanego interfejsu LLM z retry i fallbackiem
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const Anthropic = require('@anthropic-ai/sdk');
const { createMessage, ask } = require('../src/services/llm');

const getCreateMock = () => new Anthropic().messages.create;

beforeEach(() => {
  getCreateMock().mockReset();
  jest.restoreAllMocks();
});

// --- createMessage ---

describe('createMessage', () => {
  it('zwraca znormalizowaną odpowiedź przy sukcesie', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'Odpowiedź' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await createMessage({
      tier: 'smart',
      messages: [{ role: 'user', content: 'Cześć' }],
    });

    expect(result.text).toBe('Odpowiedź');
    expect(result.stopReason).toBe('end_turn');
    expect(result.provider).toBe('anthropic');
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.content).toEqual([{ type: 'text', text: 'Odpowiedź' }]);
  });

  it('używa modelu smart (Sonnet) dla tier smart', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await createMessage({
      tier: 'smart',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('sonnet') })
    );
  });

  it('używa modelu fast (Haiku) dla tier fast', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await createMessage({
      tier: 'fast',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('haiku') })
    );
  });

  it('przekazuje system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await createMessage({
      tier: 'smart',
      messages: [{ role: 'user', content: 'test' }],
      system: 'Jesteś asystentem',
    });

    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'Jesteś asystentem' })
    );
  });

  it('przekazuje tools', async () => {
    const tools = [{ name: 'search', description: 'Search', input_schema: {} }];
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await createMessage({
      tier: 'smart',
      messages: [{ role: 'user', content: 'test' }],
      tools,
    });

    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ tools })
    );
  });
});

// --- retry ---

describe('retry', () => {
  it('retryuje przy błędzie 429 i zwraca wynik', async () => {
    const error429 = new Error('Rate limit 429');
    error429.status = 429;

    getCreateMock()
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Po retry' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

    const result = await createMessage({
      tier: 'fast',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.text).toBe('Po retry');
    expect(getCreateMock()).toHaveBeenCalledTimes(2);
  });

  it('retryuje przy błędzie 529 (overloaded)', async () => {
    const error529 = new Error('529 overloaded');
    error529.status = 529;

    getCreateMock()
      .mockRejectedValueOnce(error529)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

    const result = await createMessage({
      tier: 'fast',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result.text).toBe('OK');
  });
});

// --- fallback ---

describe('fallback', () => {
  it('rzuca błąd gdy Anthropic fail i OpenRouter niedostępny', async () => {
    const error = new Error('Auth error');
    error.status = 401;
    getCreateMock().mockRejectedValue(error);

    // OpenRouter niedostępny (brak klucza)
    jest.mock('../src/services/openrouter', () => ({
      isOpenRouterEnabled: () => false,
      callOpenRouter: jest.fn(),
    }));

    await expect(
      createMessage({
        tier: 'smart',
        messages: [{ role: 'user', content: 'test' }],
      })
    ).rejects.toThrow('Auth error');
  });
});

// --- ask convenience ---

describe('ask', () => {
  it('zwraca tekst z odpowiedzi', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ type: 'text', text: 'Odpowiedź tekstowa' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    const result = await ask({
      tier: 'fast',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result).toBe('Odpowiedź tekstowa');
    expect(typeof result).toBe('string');
  });

  it('łączy wiele text bloków w jeden string', async () => {
    getCreateMock().mockResolvedValue({
      content: [
        { type: 'text', text: 'Część 1' },
        { type: 'text', text: ' Część 2' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
    });

    const result = await ask({
      tier: 'smart',
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(result).toBe('Część 1 Część 2');
  });
});
