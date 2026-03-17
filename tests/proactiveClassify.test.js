// Testy Haiku gatekeepera (przez zunifikowany LLM)
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(),
  createMessage: jest.fn(),
}));

const { ask } = require('../src/services/llm');
const { shouldIwanRespond, parseGatekeeperResponse } = require('../src/proactive/proactiveClassify');

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
    ask.mockReset();
  });

  afterAll(() => {
    process.env = original;
  });

  it('woła LLM i parsuje odpowiedź', async () => {
    ask.mockResolvedValue('DECISION: tak\nCONFIDENCE: 0.9\nREASON: Pytanie o urlopy');

    const result = await shouldIwanRespond('kto jest na urlopie?', 'topic:urlopy');
    expect(result.should).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it('używa tier fast', async () => {
    ask.mockResolvedValue('DECISION: nie\nCONFIDENCE: 0.8\nREASON: Nie');

    await shouldIwanRespond('test', 'test');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast' })
    );
  });

  it('ustawia maxTokens na 100', async () => {
    ask.mockResolvedValue('DECISION: nie\nCONFIDENCE: 0.3\nREASON: Nie');

    await shouldIwanRespond('test', 'test');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 100 })
    );
  });
});
