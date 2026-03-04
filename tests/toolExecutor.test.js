// Testy executora narzędzi
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/search', () => ({
  searchSlackHistory: jest.fn(),
  buildContextFromMessages: jest.fn(),
}));
jest.mock('../src/services/notion', () => ({
  searchNotion: jest.fn(),
  buildContextFromNotion: jest.fn(),
}));
jest.mock('../src/services/workforce', () => ({
  buildDateRange: jest.fn(),
  getTimeline: jest.fn(),
  buildContextFromWorkforce: jest.fn(),
}));
jest.mock('../src/services/users', () => ({
  resolveUserNames: jest.fn(),
  getUserName: jest.fn(),
}));

const { createToolExecutors, executeToolCalls, MAX_TOOL_ROUNDS } = require('../src/services/toolExecutor');
const { searchSlackHistory, buildContextFromMessages } = require('../src/services/search');
const { searchNotion, buildContextFromNotion } = require('../src/services/notion');
const { buildDateRange, getTimeline, buildContextFromWorkforce } = require('../src/services/workforce');
const { resolveUserNames, getUserName } = require('../src/services/users');

describe('createToolExecutors', () => {
  const mockApp = {};
  const channelId = 'C123';
  const threadTs = '1234.5678';

  beforeEach(() => jest.clearAllMocks());

  it('zwraca obiekt z 4 executorami', () => {
    const executors = createToolExecutors(mockApp, channelId, threadTs);
    expect(executors).toHaveProperty('read_thread');
    expect(executors).toHaveProperty('search_slack_history');
    expect(executors).toHaveProperty('search_notion');
    expect(executors).toHaveProperty('search_workforce');
  });

  it('read_thread pobiera wiadomości z wątku via Slack API', async () => {
    const mockApp = {
      client: {
        conversations: {
          replies: jest.fn().mockResolvedValue({
            messages: [
              { user: 'U1', ts: '1709560000.000', text: 'Pierwsza wiadomość' },
              { user: 'U2', ts: '1709560100.000', text: 'Odpowiedź' },
            ],
          }),
        },
      },
    };
    getUserName.mockResolvedValue('Jan');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.read_thread();

    expect(mockApp.client.conversations.replies).toHaveBeenCalledWith({
      channel: channelId,
      ts: threadTs,
      limit: 50,
    });
    expect(result).toContain('WIADOMOŚCI Z BIEŻĄCEGO WĄTKU');
    expect(result).toContain('Pierwsza wiadomość');
    expect(result).toContain('Odpowiedź');
  });

  it('search_slack_history woła searchSlackHistory z channelId i threadTs', async () => {
    searchSlackHistory.mockResolvedValue([]);
    resolveUserNames.mockResolvedValue([]);
    buildContextFromMessages.mockReturnValue('kontekst slack');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.search_slack_history({ query: 'deploy' });

    expect(searchSlackHistory).toHaveBeenCalledWith('deploy', channelId, threadTs);
    expect(resolveUserNames).toHaveBeenCalledWith(mockApp, []);
    expect(buildContextFromMessages).toHaveBeenCalledWith([]);
    expect(result).toBe('kontekst slack');
  });

  it('search_notion woła searchNotion i buildContextFromNotion', async () => {
    searchNotion.mockResolvedValue([{ id: 'page1' }]);
    buildContextFromNotion.mockResolvedValue('kontekst notion');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.search_notion({ query: 'procedury' });

    expect(searchNotion).toHaveBeenCalledWith('procedury');
    expect(buildContextFromNotion).toHaveBeenCalledWith([{ id: 'page1' }]);
    expect(result).toBe('kontekst notion');
  });

  it('search_workforce woła buildDateRange + getTimeline + buildContextFromWorkforce', async () => {
    buildDateRange.mockReturnValue({ startDate: '2026-03-01', endDate: '2026-03-31' });
    getTimeline.mockResolvedValue({ employees: [] });
    buildContextFromWorkforce.mockReturnValue('kontekst workforce');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.search_workforce({ query: 'kto jest wolny w marcu' });

    expect(buildDateRange).toHaveBeenCalledWith('kto jest wolny w marcu');
    expect(getTimeline).toHaveBeenCalledWith('2026-03-01', '2026-03-31');
    expect(buildContextFromWorkforce).toHaveBeenCalledWith({ employees: [] });
    expect(result).toBe('kontekst workforce');
  });
});

describe('executeToolCalls', () => {
  it('zwraca pustą tablicę gdy brak tool_use bloków', async () => {
    const response = { content: [{ type: 'text', text: 'Cześć!' }] };
    const results = await executeToolCalls(response, {});
    expect(results).toEqual([]);
  });

  it('wykonuje narzędzia równolegle i zwraca wyniki', async () => {
    const response = {
      content: [
        { type: 'tool_use', id: 'call_1', name: 'search_slack_history', input: { query: 'test' } },
        { type: 'tool_use', id: 'call_2', name: 'search_notion', input: { query: 'docs' } },
      ],
    };
    const executors = {
      search_slack_history: jest.fn().mockResolvedValue('slack result'),
      search_notion: jest.fn().mockResolvedValue('notion result'),
    };

    const results = await executeToolCalls(response, executors);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: 'tool_result', tool_use_id: 'call_1', content: 'slack result' });
    expect(results[1]).toEqual({ type: 'tool_result', tool_use_id: 'call_2', content: 'notion result' });
  });

  it('zwraca is_error dla nieznanego narzędzia', async () => {
    const response = {
      content: [{ type: 'tool_use', id: 'call_x', name: 'unknown_tool', input: {} }],
    };

    const results = await executeToolCalls(response, {});
    expect(results[0].is_error).toBe(true);
    expect(results[0].content).toContain('Nieznane narzędzie');
  });
});

describe('MAX_TOOL_ROUNDS', () => {
  it('wynosi 3', () => {
    expect(MAX_TOOL_ROUNDS).toBe(3);
  });
});
