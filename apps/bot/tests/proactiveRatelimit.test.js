// Testy globalnego rate limitu proaktywnych odpowiedzi

describe('proactiveRatelimit', () => {
  const original = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...original };
    process.env.PROACTIVE_GLOBAL_MAX_PER_HOUR = '3';
  });

  afterAll(() => {
    process.env = original;
  });

  it('pozwala gdy brak odpowiedzi', () => {
    const { checkProactiveRateLimit, _getTimestamps } = require('../src/proactive/proactiveRatelimit');
    _getTimestamps().length = 0;
    const result = checkProactiveRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('blokuje po przekroczeniu limitu', () => {
    const { checkProactiveRateLimit, recordProactiveResponse, _getTimestamps } = require('../src/proactive/proactiveRatelimit');
    _getTimestamps().length = 0;
    recordProactiveResponse();
    recordProactiveResponse();
    recordProactiveResponse();
    const result = checkProactiveRateLimit();
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(3);
  });

  it('czyści stare wpisy (> 1h)', () => {
    const { checkProactiveRateLimit, _getTimestamps } = require('../src/proactive/proactiveRatelimit');
    _getTimestamps().length = 0;
    // Dodaj wpis sprzed 2h
    _getTimestamps().push(Date.now() - 2 * 60 * 60 * 1000);
    _getTimestamps().push(Date.now() - 2 * 60 * 60 * 1000);
    _getTimestamps().push(Date.now() - 2 * 60 * 60 * 1000);
    const result = checkProactiveRateLimit();
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(0);
  });

  it('recordProactiveResponse dodaje timestamp', () => {
    const { recordProactiveResponse, _getTimestamps } = require('../src/proactive/proactiveRatelimit');
    _getTimestamps().length = 0;
    recordProactiveResponse();
    expect(_getTimestamps().length).toBe(1);
  });
});
