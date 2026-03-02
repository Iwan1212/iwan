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
    const result = await askClaude('Cześć', 'Jan');
    expect(result).toBe('Odpowiedź od Claude');
  });

  it('używa modelu Sonnet', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askClaude('Test', 'Jan');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({ model: expect.stringContaining('sonnet') })
    );
  });

  it('zawiera userName w system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askClaude('Kim jestem?', 'Jan Kamiński');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Jan Kamiński'),
      })
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
    const result = await askClaudeWithHistory(messages, 'Piotr');
    expect(result).toBe('Kontynuacja');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        system: expect.stringContaining('Piotr'),
      })
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
    await askClaudeWithContext(messages, context, 'Anna');
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('KONTEKST: test wiadomość'),
        messages,
      })
    );
  });

  it('zawiera userName w system prompt z kontekstem', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    await askClaudeWithContext(
      [{ role: 'user', content: 'test' }],
      '\n\nKONTEKST: dane',
      'Anna Nowak'
    );
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Anna Nowak'),
      })
    );
  });

  it('zawiera companyContext w system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[firma]: Momentum';
    await askClaudeWithContext(
      [{ role: 'user', content: 'test' }],
      '\n\nKONTEKST: dane',
      'Anna',
      companyCtx
    );
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('INFORMACJE O FIRMIE'),
      })
    );
  });
});

describe('companyContext w system prompt', () => {
  it('askClaude przekazuje companyContext do system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[firma]: Momentum';
    await askClaude('Cześć', 'Jan', companyCtx);
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('INFORMACJE O FIRMIE'),
      })
    );
  });

  it('askClaudeWithHistory przekazuje companyContext do system prompt', async () => {
    getCreateMock().mockResolvedValue({
      content: [{ text: 'OK' }],
    });
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[dzialy]: Delivery, Growth';
    await askClaudeWithHistory(
      [{ role: 'user', content: 'test' }],
      'Jan',
      companyCtx
    );
    expect(getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('[dzialy]: Delivery, Growth'),
      })
    );
  });
});
