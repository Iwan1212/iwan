// Testy Haiku respondera dla small-talk
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');
const { askHaiku } = require('../src/services/claudeHaiku');

const getCreateMock = () => new Anthropic().messages.create;

describe('askHaiku', () => {
  beforeEach(() => getCreateMock().mockReset());

  it('zwraca tekst odpowiedzi', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'Siema! Stay hard! 💪' }],
    });
    const result = await askHaiku(
      [{ role: 'user', content: 'Cześć' }],
      'Jan',
    );
    expect(result).toBe('Siema! Stay hard! 💪');
  });

  it('używa modelu Haiku', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askHaiku([{ role: 'user', content: 'Siema' }], 'Jan');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('haiku') })
    );
  });

  it('ustawia max_tokens na 256', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askHaiku([{ role: 'user', content: 'Co tam?' }], 'Jan');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 256 })
    );
  });

  it('zawiera userName w system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askHaiku([{ role: 'user', content: 'Hej' }], 'Anna Nowak');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Anna Nowak'),
      })
    );
  });

  it('nie przekazuje tools', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askHaiku([{ role: 'user', content: 'test' }], 'Jan');
    const callArgs = getCreateMock().mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('tools');
  });
});
