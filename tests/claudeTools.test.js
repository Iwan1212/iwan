// Testy Claude z pętlą tool use i prompt caching
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');
const { askClaudeWithTools, extractText } = require('../src/services/claudeTools');

const getCreateMock = () => new Anthropic().messages.create;

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
  beforeEach(() => getCreateMock().mockReset());

  it('zwraca tekst gdy Claude nie woła narzędzi', async () => {
    getCreateMock().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Cześć! Jak mogę pomóc?' }],
    });

    const result = await askClaudeWithTools(
      [{ role: 'user', content: 'Cześć' }],
      {},
      'Jan',
    );
    expect(result).toBe('Cześć! Jak mogę pomóc?');
    expect(getCreateMock()).toHaveBeenCalledTimes(1);
  });

  it('wykonuje pętlę tool use i zwraca finalny tekst', async () => {
    const createMock = getCreateMock();
    // Runda 1: Claude woła narzędzie
    createMock.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: '' },
        { type: 'tool_use', id: 'call_1', name: 'search_slack_history', input: { query: 'weekly' } },
      ],
    });
    // Runda 2: Claude odpowiada tekstem
    createMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Na ostatnim weekly omówiono...' }],
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
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(executors.search_slack_history).toHaveBeenCalledWith({ query: 'weekly' });
  });

  it('po max rounds wywołuje Claude bez narzędzi', async () => {
    const createMock = getCreateMock();
    // 3 rundy tool_use
    for (let i = 0; i < 3; i++) {
      createMock.mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: `call_${i}`, name: 'search_slack_history', input: { query: `q${i}` } },
        ],
      });
    }
    // Finalne wywołanie bez tools
    createMock.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Podsumowanie' }],
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
    expect(createMock).toHaveBeenCalledTimes(4);
    // Ostatnie wywołanie NIE ma tools
    const lastCall = createMock.mock.calls[3][0];
    expect(lastCall).not.toHaveProperty('tools');
  });

  it('przekazuje tools z cache_control w wywołaniu API', async () => {
    getCreateMock().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = getCreateMock().mock.calls[0][0];
    expect(callArgs).toHaveProperty('tools');
    expect(callArgs.tools).toHaveLength(8);
    // Ostatnie narzędzie ma cache_control
    const lastTool = callArgs.tools[callArgs.tools.length - 1];
    expect(lastTool.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('system prompt jest tablicą z cache_control', async () => {
    getCreateMock().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = getCreateMock().mock.calls[0][0];
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system).toHaveLength(2);
    expect(callArgs.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(callArgs.system[1].cache_control).toBeUndefined();
  });

  it('używa modelu Sonnet 4.5', async () => {
    getCreateMock().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'OK' }],
    });

    await askClaudeWithTools(
      [{ role: 'user', content: 'test' }],
      {},
      'Jan',
    );

    const callArgs = getCreateMock().mock.calls[0][0];
    expect(callArgs.model).toContain('sonnet');
    expect(callArgs.model).toBe('claude-sonnet-4-5-20250929');
  });
});
