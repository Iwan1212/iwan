// Testy audit trail (fire-and-forget logging)
const mockInsert = jest.fn();
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({ insert: mockInsert }),
  },
}));

const { logToolExecution, sanitizeInput } = require('../src/services/audit');
const { supabase } = require('../src/services/supabase');

describe('sanitizeInput', () => {
  it('ukrywa klucze wrazliwe (token, password, secret, key)', () => {
    const input = {
      query: 'search term',
      token: 'xoxb-secret-token',
      password: 'my-password',
      api_key: 'sk-ant-xxx',
      normal: 'value',
    };

    const result = sanitizeInput(input);

    expect(result.query).toBe('search term');
    expect(result.token).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.normal).toBe('value');
  });

  it('obcina dluge stringi do 500 znakow', () => {
    const longText = 'x'.repeat(600);
    const result = sanitizeInput({ text: longText });

    expect(result.text).toHaveLength(500 + '...[truncated]'.length);
    expect(result.text).toContain('...[truncated]');
  });

  it('przepuszcza krotkie stringi bez zmian', () => {
    const result = sanitizeInput({ name: 'Jan', count: 42 });
    expect(result.name).toBe('Jan');
    expect(result.count).toBe(42);
  });

  it('obsluguje pusty obiekt', () => {
    const result = sanitizeInput({});
    expect(result).toEqual({});
  });

  it('jest case-insensitive dla kluczy wrazliwych', () => {
    const result = sanitizeInput({
      TOKEN: 'secret',
      Password: 'hidden',
      API_KEY: 'key123',
    });
    // Klucze sa lowercase-porownywane
    expect(result.TOKEN).toBe('[REDACTED]');
    expect(result.Password).toBe('[REDACTED]');
    expect(result.API_KEY).toBe('[REDACTED]');
  });
});

describe('logToolExecution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ data: [{}], error: null });
  });

  it('zapisuje wpis do tabeli audit_logs', async () => {
    await logToolExecution({
      channelId: 'C123',
      userId: 'U456',
      toolName: 'search_notion',
      toolInput: { query: 'budżet Q4' },
      resultStatus: 'success',
      resultSummary: 'Znaleziono 3 strony',
      durationMs: 150,
      threadTs: '1234.5678',
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_logs');
    expect(mockInsert).toHaveBeenCalledWith({
      channel_id: 'C123',
      user_id: 'U456',
      tool_name: 'search_notion',
      tool_input: { query: 'budżet Q4' },
      result_status: 'success',
      result_summary: 'Znaleziono 3 strony',
      duration_ms: 150,
      thread_ts: '1234.5678',
    });
  });

  it('sanitizuje tool_input przed zapisem', async () => {
    await logToolExecution({
      channelId: 'C123',
      userId: 'U456',
      toolName: 'send_slack_message',
      toolInput: { channel: 'C789', token: 'xoxb-secret' },
      resultStatus: 'success',
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.tool_input.token).toBe('[REDACTED]');
    expect(insertArg.tool_input.channel).toBe('C789');
  });

  it('ustawia null dla opcjonalnych pol gdy nie podane', async () => {
    await logToolExecution({
      channelId: 'C123',
      userId: 'U456',
      toolName: 'read_thread',
      resultStatus: 'success',
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.tool_input).toBeNull();
    expect(insertArg.result_summary).toBeNull();
    expect(insertArg.duration_ms).toBeNull();
    expect(insertArg.thread_ts).toBeNull();
  });

  it('obcina result_summary do 500 znakow', async () => {
    await logToolExecution({
      channelId: 'C123',
      userId: 'U456',
      toolName: 'read_channel',
      resultStatus: 'success',
      resultSummary: 'a'.repeat(700),
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.result_summary).toHaveLength(500);
  });

  it('nigdy nie throwuje — fire-and-forget', async () => {
    mockInsert.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      logToolExecution({
        channelId: 'C123',
        userId: 'U456',
        toolName: 'search_notion',
        resultStatus: 'error',
      }),
    ).resolves.not.toThrow();
  });

  it('loguje blokade z resultStatus denied', async () => {
    await logToolExecution({
      channelId: 'C123',
      userId: 'U456',
      toolName: 'send_slack_message',
      toolInput: { channel: 'C_RESTRICTED' },
      resultStatus: 'denied',
      resultSummary: 'Brak dostepu do kanalu C_RESTRICTED',
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.result_status).toBe('denied');
    expect(insertArg.result_summary).toContain('Brak dostepu');
  });
});
