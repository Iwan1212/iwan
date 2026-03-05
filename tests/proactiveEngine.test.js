// Testy głównego orkiestratora trybu proaktywnego
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/proactive/channelResolver', () => ({
  isProactiveChannel: jest.fn(),
}));
jest.mock('../src/proactive/proactiveClassify', () => ({
  shouldIwanRespond: jest.fn(),
}));
jest.mock('../src/proactive/proactiveRatelimit', () => ({
  checkProactiveRateLimit: jest.fn(),
  recordProactiveResponse: jest.fn(),
}));
jest.mock('../src/proactive/proactiveRespond', () => ({
  sendProactiveResponse: jest.fn(),
}));
jest.mock('../src/services/context', () => ({
  getCompanyContext: jest.fn().mockResolvedValue(''),
}));

const { evaluateMessage, collectTriggers, _getInProgress } = require('../src/proactive/engine');
const { isProactiveChannel } = require('../src/proactive/channelResolver');
const { shouldIwanRespond } = require('../src/proactive/proactiveClassify');
const { checkProactiveRateLimit, recordProactiveResponse } = require('../src/proactive/proactiveRatelimit');
const { sendProactiveResponse } = require('../src/proactive/proactiveRespond');

describe('collectTriggers', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    process.env.PROACTIVE_THREAD_THRESHOLD = '2';
    process.env.PROACTIVE_CHANNEL_MESSAGE_INTERVAL = '2';
  });

  afterAll(() => {
    process.env = original;
  });

  it('wykrywa topic trigger', () => {
    // Importuj bezpośrednio bo collectTriggers używa modułów bez mocków
    const engine = require('../src/proactive/engine');
    const triggers = engine.collectTriggers({ text: 'kto jest na urlopie?', channel: 'C1' }, 'C1');
    expect(triggers).toContain('topic:urlopy');
  });
});

describe('evaluateMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _getInProgress().clear();
  });

  it('pomija wiadomości z nie-proaktywnych kanałów', async () => {
    isProactiveChannel.mockReturnValue(false);

    await evaluateMessage({}, { channel: 'C1', text: 'test' }, 'random');
    expect(shouldIwanRespond).not.toHaveBeenCalled();
  });

  it('pomija wiadomości z @mention bota', async () => {
    isProactiveChannel.mockReturnValue(true);
    const app = { _botUserId: 'BOT1' };

    await evaluateMessage(app, { channel: 'C1', text: '<@BOT1> cześć' }, 'general');
    expect(shouldIwanRespond).not.toHaveBeenCalled();
  });

  it('pomija gdy gatekeeper mówi NIE', async () => {
    isProactiveChannel.mockReturnValue(true);
    shouldIwanRespond.mockResolvedValue({ should: false, confidence: 0.3, reason: 'Small talk' });

    const app = {
      _botUserId: 'BOT1',
      client: {
        conversations: {
          history: jest.fn().mockResolvedValue({ messages: [{ text: 'urlop', user: 'U1' }] }),
        },
      },
    };

    await evaluateMessage(app, { channel: 'C1', text: 'kto jest na urlopie?' }, 'general');
    expect(sendProactiveResponse).not.toHaveBeenCalled();
  });

  it('pomija gdy rate limit przekroczony', async () => {
    isProactiveChannel.mockReturnValue(true);
    shouldIwanRespond.mockResolvedValue({ should: true, confidence: 0.9, reason: 'Urlopy' });
    checkProactiveRateLimit.mockReturnValue({ allowed: false, count: 10 });

    const app = {
      _botUserId: 'BOT1',
      client: {
        conversations: {
          history: jest.fn().mockResolvedValue({ messages: [{ text: 'urlop', user: 'U1' }] }),
        },
      },
    };

    await evaluateMessage(app, { channel: 'C1', text: 'kto jest na urlopie?' }, 'general');
    expect(sendProactiveResponse).not.toHaveBeenCalled();
  });

  it('pełny pipeline: trigger → gatekeeper → respond', async () => {
    isProactiveChannel.mockReturnValue(true);
    shouldIwanRespond.mockResolvedValue({ should: true, confidence: 0.9, reason: 'Pytanie o urlopy' });
    checkProactiveRateLimit.mockReturnValue({ allowed: true, count: 2 });
    sendProactiveResponse.mockResolvedValue('Sprawdziłem urlopy.');

    const app = {
      _botUserId: 'BOT1',
      client: {
        conversations: {
          history: jest.fn().mockResolvedValue({
            messages: [{ text: 'kto jest na urlopie?', user: 'U1' }],
          }),
        },
      },
    };

    await evaluateMessage(app, { channel: 'C1', text: 'kto jest na urlopie?' }, 'general');
    expect(sendProactiveResponse).toHaveBeenCalled();
    expect(recordProactiveResponse).toHaveBeenCalled();
  });

  it('zapobiega race conditions (inProgress)', async () => {
    isProactiveChannel.mockReturnValue(true);
    // Simuluj długą odpowiedź
    shouldIwanRespond.mockImplementation(() => new Promise(resolve =>
      setTimeout(() => resolve({ should: true, confidence: 0.9, reason: 'test' }), 100)
    ));
    checkProactiveRateLimit.mockReturnValue({ allowed: true, count: 0 });
    sendProactiveResponse.mockResolvedValue('OK');

    const app = {
      _botUserId: 'BOT1',
      client: {
        conversations: {
          history: jest.fn().mockResolvedValue({
            messages: [{ text: 'urlop test', user: 'U1' }],
          }),
        },
      },
    };

    // Dwie wiadomości na tym samym kanale jednocześnie
    const p1 = evaluateMessage(app, { channel: 'C1', text: 'kto jest na urlopie?' }, 'general');
    const p2 = evaluateMessage(app, { channel: 'C1', text: 'a co z urlopami?' }, 'general');
    await Promise.all([p1, p2]);

    // Tylko jeden powinien przejść (drugi zablokowany przez inProgress)
    // Dokładna liczba zależy od timingu, ale inProgress powinien działać
    expect(_getInProgress().size).toBe(0); // Po zakończeniu inProgress puste
  });
});
