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
jest.mock('../src/services/calendar', () => ({
  getEvents: jest.fn(),
  buildCalendarDateRange: jest.fn(),
  buildContextFromCalendar: jest.fn(),
  createCalendarEvent: jest.fn(),
}));
jest.mock('../src/services/users', () => ({
  resolveUserNames: jest.fn(),
  getUserName: jest.fn(),
}));
jest.mock('../src/services/pipedrive', () => ({
  searchDeals: jest.fn(),
  getDeal: jest.fn(),
  getDealNotes: jest.fn(),
  buildContextFromDeal: jest.fn(),
  buildContextFromDeals: jest.fn(),
  createNote: jest.fn(),
  createActivity: jest.fn(),
}));

const { createToolExecutors, executeToolCalls, MAX_TOOL_ROUNDS } = require('../src/services/toolExecutor');
const { searchSlackHistory, buildContextFromMessages } = require('../src/services/search');
const { searchNotion, buildContextFromNotion } = require('../src/services/notion');
const { buildDateRange, getTimeline, buildContextFromWorkforce } = require('../src/services/workforce');
const { getEvents, buildCalendarDateRange, buildContextFromCalendar, createCalendarEvent } = require('../src/services/calendar');
const { resolveUserNames, getUserName } = require('../src/services/users');
const { createNote, createActivity } = require('../src/services/pipedrive');

describe('createToolExecutors', () => {
  const mockApp = {};
  const channelId = 'C123';
  const threadTs = '1234.5678';

  beforeEach(() => jest.clearAllMocks());

  it('zwraca obiekt z 13 executorami', () => {
    const executors = createToolExecutors(mockApp, channelId, threadTs);
    expect(executors).toHaveProperty('read_thread');
    expect(executors).toHaveProperty('read_channel');
    expect(executors).toHaveProperty('search_slack_history');
    expect(executors).toHaveProperty('search_notion');
    expect(executors).toHaveProperty('search_workforce');
    expect(executors).toHaveProperty('search_calamari');
    expect(executors).toHaveProperty('search_calendar');
    expect(executors).toHaveProperty('create_event');
    expect(executors).toHaveProperty('search_pipedrive');
    expect(executors).toHaveProperty('deal_status');
    expect(executors).toHaveProperty('create_deal_note');
    expect(executors).toHaveProperty('create_deal_activity');
    expect(executors).toHaveProperty('send_slack_message');
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

  it('search_calendar woła buildCalendarDateRange + getEvents + buildContextFromCalendar', async () => {
    buildCalendarDateRange.mockReturnValue({ startDate: '2026-03-01', endDate: '2026-03-31' });
    getEvents.mockResolvedValue([{ title: 'Standup' }]);
    buildContextFromCalendar.mockReturnValue('kontekst calendar');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.search_calendar({ query: 'spotkania w marcu' });

    expect(buildCalendarDateRange).toHaveBeenCalledWith('spotkania w marcu');
    expect(getEvents).toHaveBeenCalledWith('2026-03-01', '2026-03-31');
    expect(buildContextFromCalendar).toHaveBeenCalledWith([{ title: 'Standup' }]);
    expect(result).toBe('kontekst calendar');
  });

  it('create_event woła createCalendarEvent z parametrami', async () => {
    createCalendarEvent.mockResolvedValue('Utworzono wydarzenie "Planning" (2026-03-07T10:00:00 → 2026-03-07T11:00:00)');

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.create_event({
      title: 'Planning',
      start_datetime: '2026-03-07T10:00:00+01:00',
      end_datetime: '2026-03-07T11:00:00+01:00',
      attendees: ['jan@test.com'],
      description: 'Sprint planning',
    });

    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: 'Planning',
      startDateTime: '2026-03-07T10:00:00+01:00',
      endDateTime: '2026-03-07T11:00:00+01:00',
      attendees: ['jan@test.com'],
      description: 'Sprint planning',
    });
    expect(result).toContain('Planning');
  });

  it('create_deal_note woła createNote i zwraca potwierdzenie', async () => {
    createNote.mockResolvedValue({ id: 999 });

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.create_deal_note({ deal_id: 42, content: '<b>Notatka</b>', pinned: true });

    expect(createNote).toHaveBeenCalledWith(42, '<b>Notatka</b>', true);
    expect(result).toContain('Utworzono notatkę');
    expect(result).toContain('note_id=999');
  });

  it('create_deal_note zwraca błąd gdy createNote zwraca null', async () => {
    createNote.mockResolvedValue(null);

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.create_deal_note({ deal_id: 42, content: 'test' });

    expect(result).toContain('Błąd');
  });

  it('create_deal_activity woła createActivity i zwraca potwierdzenie', async () => {
    createActivity.mockResolvedValue({ id: 555 });

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.create_deal_activity({
      deal_id: 42, subject: 'Follow-up', type: 'call', due_date: '2026-03-20',
    });

    expect(createActivity).toHaveBeenCalledWith(42, 'Follow-up', 'call', '2026-03-20');
    expect(result).toContain('Utworzono aktywność');
    expect(result).toContain('activity_id=555');
  });

  it('create_deal_activity używa domyślnych wartości type i due_date', async () => {
    createActivity.mockResolvedValue({ id: 556 });

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    await executors.create_deal_activity({ deal_id: 10, subject: 'Task' });

    expect(createActivity).toHaveBeenCalledWith(10, 'Task', 'task', null);
  });

  it('create_deal_activity zwraca błąd gdy createActivity zwraca null', async () => {
    createActivity.mockResolvedValue(null);

    const executors = createToolExecutors(mockApp, channelId, threadTs);
    const result = await executors.create_deal_activity({ deal_id: 42, subject: 'Test' });

    expect(result).toContain('Błąd');
  });

  it('send_slack_message woła chat.postMessage i zwraca potwierdzenie', async () => {
    const mockAppSlack = {
      client: { chat: { postMessage: jest.fn().mockResolvedValue({ ok: true }) } },
    };

    const executors = createToolExecutors(mockAppSlack, channelId, threadTs);
    const result = await executors.send_slack_message({ channel: 'C04ABC', text: 'Hello team!' });

    expect(mockAppSlack.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C04ABC',
      text: 'Hello team!',
    });
    expect(result).toContain('Wiadomość wysłana');
  });

  it('send_slack_message przekazuje thread_ts gdy podany', async () => {
    const mockAppSlack = {
      client: { chat: { postMessage: jest.fn().mockResolvedValue({ ok: true }) } },
    };

    const executors = createToolExecutors(mockAppSlack, channelId, threadTs);
    await executors.send_slack_message({ channel: 'C04ABC', text: 'Reply', thread_ts: '111.222' });

    expect(mockAppSlack.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C04ABC',
      text: 'Reply',
      thread_ts: '111.222',
    });
  });

  it('send_slack_message zwraca błąd gdy postMessage rzuca wyjątek', async () => {
    const mockAppSlack = {
      client: { chat: { postMessage: jest.fn().mockRejectedValue(new Error('channel_not_found')) } },
    };

    const executors = createToolExecutors(mockAppSlack, channelId, threadTs);
    const result = await executors.send_slack_message({ channel: 'C_BAD', text: 'test' });

    expect(result).toContain('Błąd wysyłania');
    expect(result).toContain('channel_not_found');
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
