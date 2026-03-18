// Testy komunikacji z Claude API (przez zunifikowany LLM)
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(),
  createMessage: jest.fn(),
}));

const { ask } = require('../src/services/llm');
const { askClaude, askClaudeWithHistory, askClaudeWithContext } = require('../src/services/claude');

beforeEach(() => ask.mockReset());

describe('askClaude', () => {
  it('zwraca tekst odpowiedzi', async () => {
    ask.mockResolvedValue('Odpowiedź od Claude');
    const result = await askClaude('Cześć', 'Jan');
    expect(result).toBe('Odpowiedź od Claude');
  });

  it('używa tier smart', async () => {
    ask.mockResolvedValue('OK');
    await askClaude('Test', 'Jan');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'smart' })
    );
  });

  it('zawiera userName w system prompt', async () => {
    ask.mockResolvedValue('OK');
    await askClaude('Kim jestem?', 'Jan Kamiński');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Jan Kamiński'),
      })
    );
  });
});

describe('askClaudeWithHistory', () => {
  it('przekazuje historię wiadomości', async () => {
    ask.mockResolvedValue('Kontynuacja');
    const messages = [
      { role: 'user', content: 'Pytanie 1' },
      { role: 'assistant', content: 'Odp 1' },
      { role: 'user', content: 'Pytanie 2' },
    ];
    const result = await askClaudeWithHistory(messages, 'Piotr');
    expect(result).toBe('Kontynuacja');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        messages,
        system: expect.stringContaining('Piotr'),
      })
    );
  });
});

describe('askClaudeWithContext', () => {
  it('dołącza kontekst Slack do system prompt i przekazuje historię', async () => {
    ask.mockResolvedValue('Odpowiedź z kontekstem');
    const context = '\n\nKONTEKST: test wiadomość';
    const messages = [
      { role: 'user', content: 'Pytanie 1' },
      { role: 'assistant', content: 'Odp 1' },
      { role: 'user', content: 'Pytanie 2' },
    ];
    await askClaudeWithContext(messages, context, 'Anna');
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('KONTEKST: test wiadomość'),
        messages,
      })
    );
  });

  it('zawiera userName w system prompt z kontekstem', async () => {
    ask.mockResolvedValue('OK');
    await askClaudeWithContext(
      [{ role: 'user', content: 'test' }],
      '\n\nKONTEKST: dane',
      'Anna Nowak'
    );
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Anna Nowak'),
      })
    );
  });

  it('zawiera companyContext w system prompt', async () => {
    ask.mockResolvedValue('OK');
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[firma]: Momentum';
    await askClaudeWithContext(
      [{ role: 'user', content: 'test' }],
      '\n\nKONTEKST: dane',
      'Anna',
      companyCtx
    );
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('INFORMACJE O FIRMIE'),
      })
    );
  });
});

describe('companyContext w system prompt', () => {
  it('askClaude przekazuje companyContext do system prompt', async () => {
    ask.mockResolvedValue('OK');
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[firma]: Momentum';
    await askClaude('Cześć', 'Jan', companyCtx);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('INFORMACJE O FIRMIE'),
      })
    );
  });

  it('askClaudeWithHistory przekazuje companyContext do system prompt', async () => {
    ask.mockResolvedValue('OK');
    const companyCtx = '\n\nINFORMACJE O FIRMIE:\n[dzialy]: Delivery, Growth';
    await askClaudeWithHistory(
      [{ role: 'user', content: 'test' }],
      'Jan',
      companyCtx
    );
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('[dzialy]: Delivery, Growth'),
      })
    );
  });
});
