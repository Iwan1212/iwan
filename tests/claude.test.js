// Testy komunikacji z Claude API
jest.mock('@anthropic-ai/sdk', () => {
  const createMock = jest.fn();
  return jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
});

const Anthropic = require('@anthropic-ai/sdk');
const { askClaude, askClaudeWithHistory, askClaudeWithContext } = require('../src/services/claude');

const getCreateMock = () => new Anthropic().messages.create;

describe('askClaude', () => {
  it('zwraca tekst odpowiedzi', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'Odpowiedź od Claude' }],
    });
    const result = await askClaude('Cześć');
    expect(result).toBe('Odpowiedź od Claude');
  });

  it('używa modelu Sonnet', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askClaude('Test');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('sonnet') })
    );
  });
});

describe('askClaudeWithHistory', () => {
  it('przekazuje historię wiadomości', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'Kontynuacja' }],
    });
    const messages = [
      { role: 'user', content: 'Pytanie 1' },
      { role: 'assistant', content: 'Odp 1' },
      { role: 'user', content: 'Pytanie 2' },
    ];
    const result = await askClaudeWithHistory(messages);
    expect(result).toBe('Kontynuacja');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ messages })
    );
  });
});

describe('askClaudeWithContext', () => {
  it('dołącza kontekst Slack do system prompt i przekazuje historię', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'Odpowiedź z kontekstem' }],
    });
    const context = '\n\nKONTEKST: test wiadomość';
    const messages = [
      { role: 'user', content: 'Pytanie 1' },
      { role: 'assistant', content: 'Odp 1' },
      { role: 'user', content: 'Pytanie 2' },
    ];
    await askClaudeWithContext(messages, context);
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('KONTEKST: test wiadomość'),
        messages,
      })
    );
  });
});
