// Testy zapisu i odczytu historii rozmów
jest.mock('../src/services/supabase', () => {
  const mock = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };
  return { supabase: mock };
});
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const { supabase } = require('../src/services/supabase');
const { saveMessage, getHistory } = require('../src/services/memory');

describe('saveMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('zapisuje wiadomość do tabeli conversations', async () => {
    supabase.from().insert.mockResolvedValue({ data: [{}], error: null });
    await saveMessage('C123', '123.456', 'U789', 'user', 'Cześć');
    expect(supabase.from).toHaveBeenCalledWith('conversations');
    expect(supabase.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'C123',
        thread_ts: '123.456',
        user_id: 'U789',
        role: 'user',
        content: 'Cześć',
      })
    );
  });

  it('zapisuje null thread_ts gdy brak wątku', async () => {
    supabase.from().insert.mockResolvedValue({ data: [{}], error: null });
    await saveMessage('C123', null, 'U789', 'user', 'Cześć');
    expect(supabase.from().insert).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: null })
    );
  });

  it('loguje błąd gdy zapis się nie udał', async () => {
    const { logError } = require('../src/services/errors');
    supabase.from().insert.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    await saveMessage('C123', null, 'U789', 'user', 'Cześć');
    expect(logError).toHaveBeenCalledWith('memory', expect.any(String), 'DB error');
  });
});

describe('getHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pobiera historię z wątku', async () => {
    supabase.from().select().eq().order().limit.mockResolvedValue({
      data: [{ role: 'user', content: 'Pytanie' }],
      error: null,
    });
    const result = await getHistory('C123', '123.456');
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Pytanie');
  });

  it('używa .is(null) gdy brak thread_ts', async () => {
    supabase.from().select().eq().is().order().limit.mockResolvedValue({
      data: [],
      error: null,
    });
    const result = await getHistory('C123', null);
    expect(result).toEqual([]);
  });

  it('zwraca pustą tablicę przy błędzie', async () => {
    const { logError } = require('../src/services/errors');
    supabase.from().select().eq().order().limit.mockResolvedValue({
      data: null,
      error: { message: 'Timeout' },
    });
    const result = await getHistory('C123', '123.456');
    expect(result).toEqual([]);
    expect(logError).toHaveBeenCalled();
  });
});
