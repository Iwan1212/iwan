// Testy proaktywnej odpowiedzi
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/proactive/proactiveClaudeCall', () => ({
  askClaudeProactive: jest.fn(),
}));
jest.mock('../src/services/toolExecutor', () => ({
  createToolExecutors: jest.fn().mockReturnValue({}),
  executeToolCalls: jest.fn().mockResolvedValue([]),
  MAX_TOOL_ROUNDS: 3,
}));
jest.mock('../src/services/format', () => ({
  toSlackMarkdown: jest.fn(text => text),
}));
jest.mock('../src/services/memory', () => ({
  saveMessage: jest.fn().mockResolvedValue(),
}));

const { buildProactiveMessages, sendProactiveResponse } = require('../src/proactive/proactiveRespond');
const { askClaudeProactive } = require('../src/proactive/proactiveClaudeCall');
const { saveMessage } = require('../src/services/memory');

describe('buildProactiveMessages', () => {
  it('buduje wiadomości z kontekstem i powodem', () => {
    const messages = buildProactiveMessages('Jan: kto jest na urlopie?', 'topic:urlopy');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('kto jest na urlopie?');
    expect(messages[0].content).toContain('topic:urlopy');
  });
});

describe('sendProactiveResponse', () => {
  it('wysyła odpowiedź na kanał i zapisuje w pamięci', async () => {
    askClaudeProactive.mockResolvedValue('Sprawdzam urlopy...');

    const app = {
      client: {
        chat: { postMessage: jest.fn().mockResolvedValue() },
      },
    };

    const result = await sendProactiveResponse(app, 'C1', null, 'rozmowa', 'topic:urlopy', '');
    expect(result).toBe('Sprawdzam urlopy...');
    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C1', text: 'Sprawdzam urlopy...' })
    );
    expect(saveMessage).toHaveBeenCalledWith('C1', null, 'iwan', 'assistant', 'Sprawdzam urlopy...');
  });

  it('wysyła odpowiedź w wątku', async () => {
    askClaudeProactive.mockResolvedValue('Odpowiedź w wątku');

    const app = {
      client: {
        chat: { postMessage: jest.fn().mockResolvedValue() },
      },
    };

    await sendProactiveResponse(app, 'C1', '1000.0', 'rozmowa', 'active_thread', '');
    expect(app.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C1', thread_ts: '1000.0' })
    );
  });

  it('zwraca null gdy Claude nie odpowie', async () => {
    askClaudeProactive.mockResolvedValue('');

    const app = {
      client: {
        chat: { postMessage: jest.fn().mockResolvedValue() },
      },
    };

    const result = await sendProactiveResponse(app, 'C1', null, 'rozmowa', 'test', '');
    expect(result).toBeNull();
    expect(app.client.chat.postMessage).not.toHaveBeenCalled();
  });
});
