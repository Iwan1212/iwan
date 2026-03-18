// Testy cache'owania nazw kanałów ze Slack API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/cache', () => ({
  withCache: jest.fn((_key, _ttl, fetcher) => fetcher()),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  isRedisEnabled: jest.fn().mockReturnValue(false),
  CACHE_TTL: { NOTION_SEARCH: 1800, NOTION_PAGE: 3600, PIPEDRIVE_SEARCH: 900, PIPEDRIVE_DEAL: 1800, PIPEDRIVE_NOTES: 1800, WORKFORCE_TIMELINE: 7200, CALENDAR_EVENTS: 1800, CALAMARI_ABSENCES: 3600, USER_NAME: 86400, CHANNEL_NAME: 86400 },
}));

describe('getChannelName', () => {
  beforeEach(() => jest.resetModules());

  it('pobiera nazwę kanału z Slack API', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    jest.mock('../src/services/cache', () => ({ getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn().mockResolvedValue(undefined), CACHE_TTL: { CHANNEL_NAME: 86400 } }));
    const { getChannelName } = require('../src/services/channels');
    const app = {
      client: {
        conversations: {
          info: jest.fn().mockResolvedValue({
            channel: { name: 'general' },
          }),
        },
      },
    };
    const name = await getChannelName(app, 'C123');
    expect(name).toBe('general');
  });

  it('cachuje wynik — drugie wywołanie nie odpytuje API', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    jest.mock('../src/services/cache', () => ({ getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn().mockResolvedValue(undefined), CACHE_TTL: { CHANNEL_NAME: 86400 } }));
    const { getChannelName } = require('../src/services/channels');
    const app = {
      client: {
        conversations: {
          info: jest.fn().mockResolvedValue({
            channel: { name: 'random' },
          }),
        },
      },
    };
    await getChannelName(app, 'C555');
    await getChannelName(app, 'C555');
    expect(app.client.conversations.info).toHaveBeenCalledTimes(1);
  });

  it('zwraca channelId gdy API zwraca błąd', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    jest.mock('../src/services/cache', () => ({ getCache: jest.fn().mockResolvedValue(null), setCache: jest.fn().mockResolvedValue(undefined), CACHE_TTL: { CHANNEL_NAME: 86400 } }));
    const { getChannelName } = require('../src/services/channels');
    const app = {
      client: {
        conversations: {
          info: jest.fn().mockRejectedValue(new Error('channel_not_found')),
        },
      },
    };
    const name = await getChannelName(app, 'C404');
    expect(name).toBe('C404');
  });
});
