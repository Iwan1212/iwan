// Testy resolvera kanałów proaktywnych

describe('channelResolver', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    process.env.PROACTIVE_CHANNELS = 'general,team';
  });

  afterAll(() => {
    process.env = original;
  });

  it('resolvuje nazwy kanałów na ID', async () => {
    const { resolveProactiveChannels, isProactiveChannel, _getChannelMap } = require('../src/proactive/channelResolver');
    _getChannelMap().clear();

    const app = {
      client: {
        conversations: {
          list: jest.fn().mockResolvedValue({
            channels: [
              { name: 'general', id: 'C001' },
              { name: 'team', id: 'C002' },
              { name: 'random', id: 'C003' },
            ],
          }),
        },
      },
    };

    await resolveProactiveChannels(app);
    expect(isProactiveChannel('C001')).toBe(true);
    expect(isProactiveChannel('C002')).toBe(true);
    expect(isProactiveChannel('C003')).toBe(false);
  });

  it('isProactiveChannel zwraca false dla nieznanego kanału', () => {
    const { isProactiveChannel, _setChannelMap } = require('../src/proactive/channelResolver');
    _setChannelMap(new Map([['general', 'C001']]));
    expect(isProactiveChannel('C999')).toBe(false);
  });

  it('obsługuje brak PROACTIVE_CHANNELS', async () => {
    delete process.env.PROACTIVE_CHANNELS;
    const { resolveProactiveChannels, _getChannelMap } = require('../src/proactive/channelResolver');
    _getChannelMap().clear();

    const app = {
      client: { conversations: { list: jest.fn() } },
    };

    await resolveProactiveChannels(app);
    // Nie powinien wołać API
    expect(app.client.conversations.list).not.toHaveBeenCalled();
  });

  it('obsługuje błąd API', async () => {
    const { resolveProactiveChannels, _getChannelMap } = require('../src/proactive/channelResolver');
    _getChannelMap().clear();

    const app = {
      client: {
        conversations: {
          list: jest.fn().mockRejectedValue(new Error('API error')),
        },
      },
    };

    // Nie powinien rzucić błędu
    await expect(resolveProactiveChannels(app)).resolves.toBeUndefined();
  });
});
