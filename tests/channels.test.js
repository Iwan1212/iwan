// Testy cache'owania nazw kanałów ze Slack API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

describe('getChannelName', () => {
  beforeEach(() => jest.resetModules());

  it('pobiera nazwę kanału z Slack API', async () => {
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
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
