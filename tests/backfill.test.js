// Testy backfillu historii kanałów Slack
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/channels', () => ({
  getChannelName: jest.fn().mockResolvedValue('general'),
}));
jest.mock('../src/services/users', () => ({
  getUserName: jest.fn().mockResolvedValue('Jan Kowalski'),
}));

const { backfillChannel, backfillAllChannels } = require('../src/crawler/backfill');
const { setupBackfillTrigger } = require('../src/crawler/backfillTrigger');
const { getUserName } = require('../src/services/users');
const { supabase } = require('../src/services/supabase');

// Helper — stwórz mock app z wielostronicową historią
function createMockApp(pages) {
  let callCount = 0;
  return {
    client: {
      conversations: {
        history: jest.fn(async () => {
          const page = pages[callCount] || { messages: [], nextCursor: null };
          callCount++;
          return {
            messages: page.messages,
            response_metadata: { next_cursor: page.nextCursor },
          };
        }),
        list: jest.fn().mockResolvedValue({
          channels: [
            { id: 'C1', name: 'general', is_member: true },
            { id: 'C2', name: 'random', is_member: false },
          ],
        }),
        info: jest.fn().mockResolvedValue({ channel: { name: 'general' } }),
      },
      auth: {
        test: jest.fn().mockResolvedValue({ user_id: 'UBOT' }),
      },
    },
    event: jest.fn(),
  };
}

describe('backfillChannel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pobiera wszystkie strony z paginacją', async () => {
    const app = createMockApp([
      {
        messages: [{ user: 'U1', text: 'msg1', ts: '1.1' }],
        nextCursor: 'cursor1',
      },
      {
        messages: [{ user: 'U2', text: 'msg2', ts: '1.2' }],
        nextCursor: null,
      },
    ]);

    const saved = await backfillChannel(app, 'C1');
    expect(saved).toBe(2);
    expect(app.client.conversations.history).toHaveBeenCalledTimes(2);
  });

  it('pomija wiadomości botów', async () => {
    const app = createMockApp([
      {
        messages: [
          { user: 'U1', text: 'ludzka', ts: '1.1' },
          { bot_id: 'B1', text: 'botowa', ts: '1.2' },
        ],
        nextCursor: null,
      },
    ]);

    const saved = await backfillChannel(app, 'C1');
    expect(saved).toBe(1);
  });

  it('pomija wiadomości bez tekstu', async () => {
    const app = createMockApp([
      {
        messages: [
          { user: 'U1', text: 'ok', ts: '1.1' },
          { user: 'U2', ts: '1.2' },
        ],
        nextCursor: null,
      },
    ]);

    const saved = await backfillChannel(app, 'C1');
    expect(saved).toBe(1);
  });

  it('resolwuje user names batch — unikalne IDs tylko raz', async () => {
    const app = createMockApp([
      {
        messages: [
          { user: 'U1', text: 'a', ts: '1.1' },
          { user: 'U1', text: 'b', ts: '1.2' },
          { user: 'U2', text: 'c', ts: '1.3' },
        ],
        nextCursor: null,
      },
    ]);

    await backfillChannel(app, 'C1');
    // U1 resolwowany raz, U2 raz = 2 wywołania
    expect(getUserName).toHaveBeenCalledTimes(2);
  });

  it('retry na rate limit (429)', async () => {
    let callCount = 0;
    const app = createMockApp([]);
    app.client.conversations.history = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('ratelimited');
        err.data = { error: 'ratelimited' };
        err.headers = { 'retry-after': 0 };
        throw err;
      }
      return {
        messages: [{ user: 'U1', text: 'ok', ts: '1.1' }],
        response_metadata: { next_cursor: null },
      };
    });

    const saved = await backfillChannel(app, 'C1');
    expect(saved).toBe(1);
    expect(app.client.conversations.history).toHaveBeenCalledTimes(2);
  });
});

describe('backfillAllChannels', () => {
  beforeEach(() => jest.clearAllMocks());

  it('backfilluje tylko kanały, w których bot jest członkiem', async () => {
    const app = createMockApp([
      { messages: [{ user: 'U1', text: 'msg', ts: '1.1' }], nextCursor: null },
    ]);

    await backfillAllChannels(app);
    // Tylko C1 (is_member: true), C2 pominięty
    expect(app.client.conversations.history).toHaveBeenCalledTimes(1);
  });
});

describe('setupBackfillTrigger', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejestruje listener na member_joined_channel', () => {
    const app = createMockApp([]);
    setupBackfillTrigger(app);
    expect(app.event).toHaveBeenCalledWith('member_joined_channel', expect.any(Function));
  });

  it('wysyła wiadomość powitalną gdy bot dołącza do kanału', async () => {
    const app = createMockApp([
      { messages: [], nextCursor: null },
    ]);
    app.client.chat = { postMessage: jest.fn().mockResolvedValue({ ok: true }) };

    setupBackfillTrigger(app);
    const handler = app.event.mock.calls[0][1];

    await handler({ event: { user: 'UBOT', channel: 'C1' } });
    expect(app.client.chat.postMessage).toHaveBeenCalledWith({
      channel: 'C1',
      text: expect.stringContaining('Iwan'),
    });
  });

  it('triggeruje backfill tylko gdy bot dołącza', async () => {
    const app = createMockApp([
      { messages: [], nextCursor: null },
    ]);
    app.client.chat = { postMessage: jest.fn().mockResolvedValue({ ok: true }) };

    // Śledzenie wywołania backfill przez spy na conversations.history
    let backfillDone;
    const backfillPromise = new Promise(r => { backfillDone = r; });
    const origHistory = app.client.conversations.history;
    app.client.conversations.history = jest.fn(async (...args) => {
      const result = await origHistory(...args);
      backfillDone();
      return result;
    });

    setupBackfillTrigger(app);
    const handler = app.event.mock.calls[0][1];

    // Bot dołącza — powinien triggerować
    await handler({ event: { user: 'UBOT', channel: 'C1' } });
    await backfillPromise;
    expect(app.client.conversations.history).toHaveBeenCalled();
  });

  it('nie triggeruje backfillu gdy inny user dołącza', async () => {
    const app = createMockApp([]);
    setupBackfillTrigger(app);
    const handler = app.event.mock.calls[0][1];

    await handler({ event: { user: 'UOTHER', channel: 'C1' } });
    await new Promise(r => setTimeout(r, 50));
    expect(app.client.conversations.history).not.toHaveBeenCalled();
  });
});
