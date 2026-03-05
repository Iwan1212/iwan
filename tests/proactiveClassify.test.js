// Testy Haiku gatekeepera
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');
const { shouldIwanRespond, parseGatekeeperResponse } = require('../src/proactive/proactiveClassify');

const getCreateMock = () => new Anthropic().messages.create;

describe('parseGatekeeperResponse', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
    process.env.PROACTIVE_CONFIDENCE_THRESHOLD = '0.7';
  });

  afterAll(() => {
    process.env = original;
  });

  it('parsuje pozytywną odpowiedź', () => {
    const result = parseGatekeeperResponse('DECISION: tak\nCONFIDENCE: 0.9\nREASON: Ktoś pyta o urlopy');
    expect(result.should).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.reason).toBe('Ktoś pyta o urlopy');
  });

  it('parsuje negatywną odpowiedź', () => {
    const result = parseGatekeeperResponse('DECISION: nie\nCONFIDENCE: 0.8\nREASON: Small talk');
    expect(result.should).toBe(false);
    expect(result.confidence).toBe(0.8);
    expect(result.reason).toBe('Small talk');
  });

  it('zwraca false gdy confidence poniżej threshold', () => {
    const result = parseGatekeeperResponse('DECISION: tak\nCONFIDENCE: 0.5\nREASON: Może');
    expect(result.should).toBe(false);
    expect(result.confidence).toBe(0.5);
  });

  it('zwraca false gdy brak DECISION', () => {
    const result = parseGatekeeperResponse('jakiś losowy tekst');
    expect(result.should).toBe(false);
    expect(result.confidence).toBe(0);
  });
});

describe('shouldIwanRespond', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
    process.env.PROACTIVE_CONFIDENCE_THRESHOLD = '0.7';
    getCreateMock().mockReset();
  });

  afterAll(() => {
    process.env = original;
  });

  it('woła Haiku i parsuje odpowiedź', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'DECISION: tak\nCONFIDENCE: 0.9\nREASON: Pytanie o urlopy' }],
    });

    const result = await shouldIwanRespond('kto jest na urlopie?', 'topic:urlopy');
    expect(result.should).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('używa modelu Haiku', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'DECISION: nie\nCONFIDENCE: 0.8\nREASON: Nie' }],
    });

    await shouldIwanRespond('test', 'test');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('haiku') })
    );
  });

  it('ustawia max_tokens na 100', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'DECISION: nie\nCONFIDENCE: 0.3\nREASON: Nie' }],
    });

    await shouldIwanRespond('test', 'test');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 100 })
    );
  });
});
