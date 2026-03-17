// Testy Claude z pętlą tool use i prompt caching (przez zunifikowany LLM)
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(),
  createMessage: jest.fn(),
}));

const { createMessage } = require('../src/services/llm');
const { askClaudeWithTools, extractText } = require('../src/services/claudeTools');

describe('extractText', () => {
  it('wyciąga tekst z text bloków', () => {
    const response = {
      content: [
        { type: 'text', text: 'Cześć!' },
        { type: 'tool_use', id: '1', name: 'test', input: {} },
        { type: 'text', text: ' Jak mogę pomóc?' },
      ],
    };
    expect(extractText(response)).toBe('Cześć! Jak mogę pomóc?');
  });

  it('zwraca pusty string gdy brak text bloków', () => {
    const response = { content: [{ type: 'tool_use', id: '1', name: 'test', input: {} }] };
    expect(extractText(response)).toBe('');
  });
});

describe('askClaudeWithTools', () => {
  beforeEach(() => createMessage.mockReset());

  it('zwraca tekst gdy Claude nie woła narzędzi', async () => {
    createMessage.mockResolvedValue({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Cześć! Jak mogę pomóc?' }],
      text: 'Cześć! Jak mogę pomóc?',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    const result = await askClaudeWithTools(
      [{ role: 'user', content: 'Cześć' }],
      {},
      'Jan',
    );
    expect(result).toBe('Cześć! Jak mogę pomóc?');
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it('wykonuje pętlę tool use i zwraca finalny tekst', async () => {
    // Runda 1: Claude woła narzędzie
    createMessage.mockResolvedValueOnce({
      stopReason: 'tool_use',
      content: [
        { type: 'text', text: '' },
        { type: 'tool_use', id: 'call_1', name: 'search_slack_history', input: { query: 'weekly' } },
      ],
      text: '',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });
    // Runda 2: Claude odpowiada tekstem
    createMessage.mockResolvedValueOnce({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Na ostatnim weekly omówiono...' }],
      text: 'Na ostatnim weekly omówiono...',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    const executors = {
      search_slack_history: jest.fn().mockResolvedValue('Kontekst z historii'),
    };

    const result = await askClaudeWithTools(
      [{ role: 'user', content: 'co było na weekly?' }],
      executors,
      'Anna',
    );

    expect(result).toBe('Na ostatnim weekly omówiono...');
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(executors.search_slack_history).toHaveBeenCalledWith({ query: 'weekly' });
  });

  it('po max rounds wywołuje Claude bez narzędzi', async () => {
    // 3 rundy tool_use
    for (let i = 0; i < 3; i++) {
      createMessage.mockResolvedValueOnce({
        stopReason: 'tool_use',
        content: [
          { type: 'tool_use', id: `call_${i}`, name: 'search_slack_history', input: { query: `q${i}` } },
        ],
        text: '',
        usage: { inputTokens: 10, outputTokens: 5 },
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
      });
    }
    // Finalne wywołanie bez tools
    createMessage.mockResolvedValueOnce({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'Podsumowanie' }],
      text: 'Podsumowanie',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    const executors = {
      search_slack_history: jest.fn().mockResolvedValue('wynik'),
    };

    const result = await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      executors,
      'Jan',
    );

    expect(result).toBe('Podsumowanie');
    // 3 rounds + 1 final = 4 calls
    expect(createMessage).toHaveBeenCalledTimes(4);
    // Ostatnie wywołanie NIE ma tools
    const lastCall = createMessage.mock.calls[3][0];
    expect(lastCall).not.toHaveProperty('tools');
  });

  it('przekazuje tools z cache_control w wywołaniu API', async () => {
    createMessage.mockResolvedValue({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
      text: 'OK',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = createMessage.mock.calls[0][0];
    expect(callArgs).toHaveProperty('tools');
    expect(callArgs.tools).toHaveLength(10);
    // Ostatnie narzędzie ma cache_control
    const lastTool = callArgs.tools[callArgs.tools.length - 1];
    expect(lastTool.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('system prompt jest tablicą z cache_control', async () => {
    createMessage.mockResolvedValue({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
      text: 'OK',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = createMessage.mock.calls[0][0];
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system).toHaveLength(2);
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(callArgs.system[1].cache_control).toBeUndefined();
  });

  it('używa tier smart', async () => {
    createMessage.mockResolvedValue({
      stopReason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
      text: 'OK',
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250929',
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = createMessage.mock.calls[0][0];
    expect(callArgs.tier).toBe('smart');
  });
});
