// Testy Haiku respondera dla small-talk (przez zunifikowany LLM)
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(),
  createMessage: jest.fn(),
}));

const { ask } = require('../src/services/llm');
const { askHaiku } = require('../src/services/claudeHaiku');

beforeEach(() => ask.mockReset());

describe('askHaiku', () => {
  it('zwraca tekst odpowiedzi', async () => {
    ask.mockResolvedValue('Siema! Stay hard! 💪');
    const result = await askHaiku(
      [{ role: 'user', content: 'Cześć' }],
      'Jan',
    );
    expect(result).toBe('Siema! Stay hard! 💪');
  });

  it('używa tier fast', async () => {
    ask.mockResolvedValue('OK');
    await askHaiku([{ role: 'user', content: 'Siema' }], 'Jan');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'fast' })
    );
  });

  it('ustawia maxTokens na 256', async () => {
    ask.mockResolvedValue('OK');
    await askHaiku([{ role: 'user', content: 'Co tam?' }], 'Jan');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 256 })
    );
  });

  it('zawiera userName w system prompt', async () => {
    ask.mockResolvedValue('OK');
    await askHaiku([{ role: 'user', content: 'Hej' }], 'Anna Nowak');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Anna Nowak'),
      })
    );
  });

  it('nie przekazuje tools (używa ask, nie createMessage)', async () => {
    ask.mockResolvedValue('OK');
    await askHaiku([{ role: 'user', content: 'test' }], 'Jan');
    const callArgs = ask.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('tools');
  });
});
