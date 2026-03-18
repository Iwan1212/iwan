// Testy wspólnych funkcji deal
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const { cleanLlmJson, preferOpenDeals, groupByThread } = require('../src/services/dealUtils');

// --- cleanLlmJson ---

describe('cleanLlmJson', () => {
  it('parsuje czysty JSON', () => {
    const result = cleanLlmJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('usuwa markdown code block', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = cleanLlmJson(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('trimuje whitespace', () => {
    const result = cleanLlmJson('  {"key": "value"}  ');
    expect(result).toEqual({ key: 'value' });
  });

  it('rzuca błąd dla niepoprawnego JSON', () => {
    expect(() => cleanLlmJson('not json')).toThrow();
  });
});

// --- preferOpenDeals ---

describe('preferOpenDeals', () => {
  it('zwraca otwarte deale', () => {
    const deals = [
      { id: 1, status: 'lost' },
      { id: 2, status: 'open' },
      { id: 3, status: 'open' },
    ];
    const result = preferOpenDeals(deals);
    expect(result).toHaveLength(2);
    expect(result.every(d => d.status === 'open')).toBe(true);
  });

  it('fallback na wszystkie gdy brak otwartych', () => {
    const deals = [
      { id: 1, status: 'lost' },
      { id: 2, status: 'won' },
    ];
    const result = preferOpenDeals(deals);
    expect(result).toHaveLength(2);
  });

  it('zwraca pustą tablicę dla pustego wejścia', () => {
    expect(preferOpenDeals([])).toEqual([]);
  });
});

// --- groupByThread ---

describe('groupByThread', () => {
  it('grupuje wiadomości po thread_ts', () => {
    const messages = [
      { text: 'a', thread_ts: '1111' },
      { text: 'b', thread_ts: '2222' },
      { text: 'c', thread_ts: '1111' },
    ];
    const threads = groupByThread(messages);
    expect(Object.keys(threads)).toHaveLength(2);
    expect(threads['1111']).toHaveLength(2);
    expect(threads['2222']).toHaveLength(1);
  });

  it('wiadomości bez thread_ts trafiają do "main"', () => {
    const messages = [
      { text: 'a' },
      { text: 'b', thread_ts: '1111' },
    ];
    const threads = groupByThread(messages);
    expect(threads['main']).toHaveLength(1);
    expect(threads['1111']).toHaveLength(1);
  });

  it('zwraca pusty obiekt dla pustej tablicy', () => {
    expect(groupByThread([])).toEqual({});
  });
});
