// Testy centralnych stałych modeli
const { MODEL_SONNET, MODEL_HAIKU } = require('../src/services/models');

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
