// Testy logowania błędów do Supabase
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn(),
  },
}));

const { supabase } = require('../src/services/supabase');
const { logError } = require('../src/services/errors');

describe('logError', () => {
  beforeEach(() => jest.clearAllMocks());

  it('zapisuje błąd do tabeli error_logs', async () => {
    supabase.from().insert.mockResolvedValue({ data: [{}], error: null });
    await logError('search', 'Błąd wyszukiwania', 'timeout');
    expect(supabase.from).toHaveBeenCalledWith('error_logs');
    expect(supabase.from().insert).toHaveBeenCalledWith({
      source: 'search',
      message: 'Błąd wyszukiwania',
      details: 'timeout',
    });
  });

  it('zapisuje null details gdy brak szczegółów', async () => {
    supabase.from().insert.mockResolvedValue({ data: [{}], error: null });
    await logError('memory', 'Błąd zapisu');
    expect(supabase.from().insert).toHaveBeenCalledWith({
      source: 'memory',
      message: 'Błąd zapisu',
      details: null,
    });
  });

  it('nie rzuca wyjątku gdy zapis do error_logs się nie udał', async () => {
    supabase.from().insert.mockRejectedValue(new Error('DB down'));
    await expect(logError('test', 'Błąd')).resolves.not.toThrow();
  });
});
