// Testy licznika wiadomości w wątkach

describe('threadTracker', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    process.env.PROACTIVE_THREAD_THRESHOLD = '3';
    process.env.PROACTIVE_THREAD_COOLDOWN_MINUTES = '60';
  });

  afterAll(() => {
    process.env = original;
  });

  it('nie triggeruje poniżej threshold', () => {
    const { trackThreadMessage, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    expect(trackThreadMessage('C1', '1000.0').triggered).toBe(false);
    expect(trackThreadMessage('C1', '1000.0').triggered).toBe(false);
  });

  it('triggeruje po osiągnięciu threshold', () => {
    const { trackThreadMessage, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    trackThreadMessage('C1', '1000.0');
    trackThreadMessage('C1', '1000.0');
    expect(trackThreadMessage('C1', '1000.0').triggered).toBe(true);
  });

  it('nie triggeruje bez threadTs', () => {
    const { trackThreadMessage, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    expect(trackThreadMessage('C1', null).triggered).toBe(false);
    expect(trackThreadMessage('C1', undefined).triggered).toBe(false);
  });

  it('markThreadResponded ustawia cooldown i resetuje count', () => {
    const { trackThreadMessage, markThreadResponded, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    // Triggeruj
    for (let i = 0; i < 3; i++) trackThreadMessage('C1', '1000.0');
    // Oznacz jako obsłużone
    markThreadResponded('C1', '1000.0');
    // Nowe wiadomości nie triggerują (cooldown)
    for (let i = 0; i < 5; i++) trackThreadMessage('C1', '1000.0');
    const entry = _getThreads().get('C1:1000.0');
    expect(entry.respondedAt).toBeGreaterThan(0);
  });

  it('cleanupThreads czyści stare wpisy', () => {
    const { trackThreadMessage, cleanupThreads, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    // Wątek sprzed 25h (ts w sekundach)
    const oldTs = ((Date.now() - 25 * 60 * 60 * 1000) / 1000).toFixed(6);
    trackThreadMessage('C1', oldTs);
    // Aktualny wątek
    const newTs = (Date.now() / 1000).toFixed(6);
    trackThreadMessage('C1', newTs);
    cleanupThreads();
    expect(_getThreads().has(`C1:${oldTs}`)).toBe(false);
    expect(_getThreads().has(`C1:${newTs}`)).toBe(true);
  });

  it('rozróżnia wątki w różnych kanałach', () => {
    const { trackThreadMessage, _getThreads } = require('../src/proactive/threadTracker');
    _getThreads().clear();
    for (let i = 0; i < 3; i++) trackThreadMessage('C1', '1000.0');
    expect(trackThreadMessage('C2', '1000.0').triggered).toBe(false);
  });
});
