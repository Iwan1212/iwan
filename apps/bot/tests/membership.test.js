// Testy Slack membership check z cache Redis
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const mockGetCache = jest.fn();
const mockSetCache = jest.fn();
jest.mock('../src/services/cache', () => ({
  getCache: (...args) => mockGetCache(...args),
  setCache: (...args) => mockSetCache(...args),
}));

const { isUserInChannel, getUserChannelIds } = require('../src/services/membership');
const { logError } = require('../src/services/errors');

describe('isUserInChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);
  });

  it('zwraca true z cache gdy user jest w kanale (cache hit)', async () => {
    mockGetCache.mockResolvedValue(true);

    const app = { client: { conversations: { members: jest.fn() } } };
    const result = await isUserInChannel(app, 'U123', 'C456');

    expect(result).toBe(true);
    expect(mockGetCache).toHaveBeenCalledWith('membership:C456:U123');
    expect(app.client.conversations.members).not.toHaveBeenCalled();
  });

  it('zwraca false z cache gdy user NIE jest w kanale (cache hit)', async () => {
    mockGetCache.mockResolvedValue(false);

    const app = { client: { conversations: { members: jest.fn() } } };
    const result = await isUserInChannel(app, 'U123', 'C456');

    expect(result).toBe(false);
    expect(app.client.conversations.members).not.toHaveBeenCalled();
  });

  it('odpytuje Slack API przy cache miss i zwraca true gdy user jest czlonkiem', async () => {
    const app = {
      client: {
        conversations: {
          members: jest.fn().mockResolvedValue({
            members: ['U111', 'U123', 'U222'],
            response_metadata: { next_cursor: '' },
          }),
        },
      },
    };

    const result = await isUserInChannel(app, 'U123', 'C456');

    expect(result).toBe(true);
    expect(app.client.conversations.members).toHaveBeenCalledWith({
      channel: 'C456',
      limit: 200,
    });
    expect(mockSetCache).toHaveBeenCalledWith('membership:C456:U123', true, 300);
  });

  it('zwraca false gdy user nie jest na liscie czlonkow', async () => {
    const app = {
      client: {
        conversations: {
          members: jest.fn().mockResolvedValue({
            members: ['U111', 'U222'],
            response_metadata: { next_cursor: '' },
          }),
        },
      },
    };

    const result = await isUserInChannel(app, 'U999', 'C456');

    expect(result).toBe(false);
    expect(mockSetCache).toHaveBeenCalledWith('membership:C456:U999', false, 300);
  });

  it('obsluguje paginacje — szuka usera na kolejnych stronach', async () => {
    const app = {
      client: {
        conversations: {
          members: jest.fn()
            .mockResolvedValueOnce({
              members: ['U111', 'U222'],
              response_metadata: { next_cursor: 'cursor_abc' },
            })
            .mockResolvedValueOnce({
              members: ['U333', 'U123'],
              response_metadata: { next_cursor: '' },
            }),
        },
      },
    };

    const result = await isUserInChannel(app, 'U123', 'C456');

    expect(result).toBe(true);
    expect(app.client.conversations.members).toHaveBeenCalledTimes(2);
    expect(app.client.conversations.members).toHaveBeenLastCalledWith({
      channel: 'C456',
      limit: 200,
      cursor: 'cursor_abc',
    });
  });

  it('zwraca false (deny by default) przy bledzie Slack API', async () => {
    const app = {
      client: {
        conversations: {
          members: jest.fn().mockRejectedValue(new Error('channel_not_found')),
        },
      },
    };

    const result = await isUserInChannel(app, 'U123', 'C_INVALID');

    expect(result).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      'membership',
      expect.stringContaining('C_INVALID'),
      expect.stringContaining('channel_not_found'),
    );
  });

  it('odpytuje Slack API gdy Redis zwraca null (cache miss/niedostepny)', async () => {
    mockGetCache.mockResolvedValue(null);

    const app = {
      client: {
        conversations: {
          members: jest.fn().mockResolvedValue({
            members: ['U123'],
            response_metadata: { next_cursor: '' },
          }),
        },
      },
    };

    const result = await isUserInChannel(app, 'U123', 'C456');
    expect(result).toBe(true);
    expect(app.client.conversations.members).toHaveBeenCalled();
  });
});

describe('getUserChannelIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);
  });

  it('zwraca liste kanalow z cache (hit)', async () => {
    mockGetCache.mockResolvedValue(['C1', 'C2', 'C3']);

    const app = { client: { users: { conversations: jest.fn() } } };
    const result = await getUserChannelIds(app, 'U123');

    expect(result).toEqual(['C1', 'C2', 'C3']);
    expect(app.client.users.conversations).not.toHaveBeenCalled();
  });

  it('odpytuje Slack API przy cache miss', async () => {
    const app = {
      client: {
        users: {
          conversations: jest.fn().mockResolvedValue({
            channels: [{ id: 'C1' }, { id: 'C2' }],
            response_metadata: { next_cursor: '' },
          }),
        },
      },
    };

    const result = await getUserChannelIds(app, 'U123');

    expect(result).toEqual(['C1', 'C2']);
    expect(app.client.users.conversations).toHaveBeenCalledWith({
      user: 'U123',
      types: 'public_channel,private_channel',
      limit: 200,
    });
    expect(mockSetCache).toHaveBeenCalledWith('membership:user-channels:U123', ['C1', 'C2'], 300);
  });

  it('obsluguje paginacje', async () => {
    const app = {
      client: {
        users: {
          conversations: jest.fn()
            .mockResolvedValueOnce({
              channels: [{ id: 'C1' }],
              response_metadata: { next_cursor: 'cur' },
            })
            .mockResolvedValueOnce({
              channels: [{ id: 'C2' }],
              response_metadata: { next_cursor: '' },
            }),
        },
      },
    };

    const result = await getUserChannelIds(app, 'U123');
    expect(result).toEqual(['C1', 'C2']);
    expect(app.client.users.conversations).toHaveBeenCalledTimes(2);
  });

  it('zwraca pusta tablice przy bledzie API', async () => {
    const app = {
      client: {
        users: {
          conversations: jest.fn().mockRejectedValue(new Error('user_not_found')),
        },
      },
    };

    const result = await getUserChannelIds(app, 'U_INVALID');
    expect(result).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });
});
