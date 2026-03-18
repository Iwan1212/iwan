// Testy centralnych stałych modeli
const { MODEL_SONNET, MODEL_HAIKU, MODEL_MAP } = require('../src/services/models');

describe('models', () => {
  it('MODEL_SONNET zawiera sonnet', () => {
    expect(MODEL_SONNET).toContain('sonnet');
  });

  it('MODEL_HAIKU zawiera haiku', () => {
    expect(MODEL_HAIKU).toContain('haiku');
  });

  it('MODEL_SONNET to Sonnet 4.5', () => {
    expect(MODEL_SONNET).toBe('claude-sonnet-4-5-20250929');
  });

  it('MODEL_HAIKU to Haiku 4.5', () => {
    expect(MODEL_HAIKU).toBe('claude-haiku-4-5-20251001');
  });
});

describe('MODEL_MAP', () => {
  it('mapuje fast na Haiku', () => {
    expect(MODEL_MAP.fast).toBe(MODEL_HAIKU);
  });

  it('mapuje smart na Sonnet', () => {
    expect(MODEL_MAP.smart).toBe(MODEL_SONNET);
  });

  it('ma dokładnie 2 tiery', () => {
    expect(Object.keys(MODEL_MAP)).toHaveLength(2);
    expect(Object.keys(MODEL_MAP)).toEqual(expect.arrayContaining(['fast', 'smart']));
  });
});
