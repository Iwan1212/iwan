// Testy rate limitera
const { checkRateLimit } = require('../src/services/ratelimit');

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Reset — wymuszamy nowy moduł z czystą Map()
    jest.resetModules();
  });

  it('pozwala na pierwszą wiadomość', () => {
    const { checkRateLimit } = require('../src/services/ratelimit');
    const result = checkRateLimit('user-fresh-1');
    expect(result.allowed).toBe(true);
    expect(result.error).toBeNull();
  });

  it('pozwala na 10 wiadomości w ciągu minuty', () => {
    const { checkRateLimit } = require('../src/services/ratelimit');
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit('user-ten');
      expect(result.allowed).toBe(true);
    }
  });

  it('blokuje 11-tą wiadomość w ciągu minuty', () => {
    const { checkRateLimit } = require('../src/services/ratelimit');
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-eleven');
    }
    const result = checkRateLimit('user-eleven');
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/wiele wiadomości/i);
  });

  it('limity są per user — różni użytkownicy nie wpływają na siebie', () => {
    const { checkRateLimit } = require('../src/services/ratelimit');
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user-a');
    }
    const result = checkRateLimit('user-b');
    expect(result.allowed).toBe(true);
  });
});
