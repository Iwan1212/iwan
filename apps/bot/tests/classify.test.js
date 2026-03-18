// Testy klasyfikacji wiadomości (przez zunifikowany LLM)
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(),
  createMessage: jest.fn(),
}));

const { ask } = require('../src/services/llm');
const { classifyMessage } = require('../src/services/classify');

beforeEach(() => ask.mockReset());

describe('classifyMessage', () => {
  it('klasyfikuje pytanie techniczne', async () => {
    ask.mockResolvedValue('pytanie-techniczne');
    const result = await classifyMessage('Jak zrobić deploy na Railway?');
    expect(result).toBe('pytanie-techniczne');
  });

  it('klasyfikuje spam', async () => {
    ask.mockResolvedValue('spam');
    const result = await classifyMessage('Kup teraz!!!');
    expect(result).toBe('spam');
  });

  it('trimuje i lowercasuje odpowiedź', async () => {
    ask.mockResolvedValue('  Small-Talk  \n');
    const result = await classifyMessage('Siema');
    expect(result).toBe('small-talk');
  });

  it('używa tier fast', async () => {
    ask.mockResolvedValue('pytanie-ogolne');
    await classifyMessage('Co to jest JavaScript?');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast' })
    );
  });
});
