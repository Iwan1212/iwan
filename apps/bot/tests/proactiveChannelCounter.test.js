// Testy licznika wiadomości na kanale

describe('channelCounter', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    process.env.PROACTIVE_CHANNEL_MESSAGE_INTERVAL = '3';
    process.env.PROACTIVE_CHANNEL_COOLDOWN_MINUTES = '30';
  });

  afterAll(() => {
    process.env = original;
  });

  it('nie triggeruje poniżej interval', () => {
    const { trackChannelMessage, _getChannels } = require('../src/proactive/channelCounter');
    _getChannels().clear();
    expect(trackChannelMessage('C1').triggered).toBe(false);
    expect(trackChannelMessage('C1').triggered).toBe(false);
  });

  it('triggeruje po osiągnięciu interval', () => {
    const { trackChannelMessage, _getChannels } = require('../src/proactive/channelCounter');
    _getChannels().clear();
    trackChannelMessage('C1');
    trackChannelMessage('C1');
    expect(trackChannelMessage('C1').triggered).toBe(true);
  });

  it('markChannelResponded ustawia cooldown i resetuje count', () => {
    const { trackChannelMessage, markChannelResponded, _getChannels } = require('../src/proactive/channelCounter');
    _getChannels().clear();
    for (let i = 0; i < 3; i++) trackChannelMessage('C1');
    markChannelResponded('C1');
    // Po cooldown, count jest 0 — nowe wiadomości nie triggerują od razu
    const result = trackChannelMessage('C1');
    // Cooldown aktywny — powinno być false
    expect(result.triggered).toBe(false);
  });

  it('rozróżnia kanały', () => {
    const { trackChannelMessage, _getChannels } = require('../src/proactive/channelCounter');
    _getChannels().clear();
    for (let i = 0; i < 3; i++) trackChannelMessage('C1');
    expect(trackChannelMessage('C2').triggered).toBe(false);
  });
});
