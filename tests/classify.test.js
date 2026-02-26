// Testy klasyfikacji wiadomości przez Claude Haiku
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');
const { classifyMessage } = require('../src/services/classify');

// Dostęp do mocka create
const getCreateMock = () => new Anthropic().messages.create;

describe('classifyMessage', () => {
  it('klasyfikuje pytanie techniczne', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'pytanie-techniczne' }],
    });
    const result = await classifyMessage('Jak zrobić deploy na Railway?');
    expect(result).toBe('pytanie-techniczne');
  });

  it('klasyfikuje spam', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'spam' }],
    });
    const result = await classifyMessage('Kup teraz!!!');
    expect(result).toBe('spam');
  });

  it('trimuje i lowercasuje odpowiedź', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: '  Small-Talk  \n' }],
    });
    const result = await classifyMessage('Siema');
    expect(result).toBe('small-talk');
  });

  it('używa modelu Haiku', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'pytanie-ogolne' }],
    });
    await classifyMessage('Co to jest JavaScript?');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('haiku') })
    );
  });
});
