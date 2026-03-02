// Testy pobierania kontekstu firmowego z Supabase
jest.mock('../src/services/supabase', () => {
  const selectMock = jest.fn();
  const fromMock = jest.fn(() => ({ select: selectMock }));
  return { supabase: { from: fromMock }, __selectMock: selectMock, __fromMock: fromMock };
});

jest.mock('../src/services/errors', () => ({
  logError: jest.fn(),
}));

const { supabase, __selectMock: selectMock } = require('../src/services/supabase');
const { logError } = require('../src/services/errors');

// Wymuszaj świeży moduł w każdym teście (czyści cache w Map)
let getCompanyContext;
beforeEach(() => {
  jest.isolateModules(() => {
    getCompanyContext = require('../src/services/context').getCompanyContext;
  });
  selectMock.mockReset();
  logError.mockReset();
});

describe('getCompanyContext', () => {
  it('zwraca sformatowany string z danymi firmowymi', async () => {
    selectMock.mockResolvedValue({
      data: [
        { topic: 'firma', content: 'Momentum to agencja digital' },
        { topic: 'dzialy', content: 'Delivery, Growth, People' },
      ],
      error: null,
    });

    const result = await getCompanyContext();

    expect(result).toContain('INFORMACJE O FIRMIE:');
    expect(result).toContain('[firma]: Momentum to agencja digital');
    expect(result).toContain('[dzialy]: Delivery, Growth, People');
    expect(supabase.from).toHaveBeenCalledWith('company_context');
  });

  it('cache — drugie wywołanie nie odpytuje DB', async () => {
    selectMock.mockResolvedValue({
      data: [{ topic: 'firma', content: 'Momentum' }],
      error: null,
    });

    await getCompanyContext();
    await getCompanyContext();

    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('zwraca pusty string przy błędzie DB (graceful degradation)', async () => {
    selectMock.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });

    const result = await getCompanyContext();

    expect(result).toBe('');
    expect(logError).toHaveBeenCalledWith(
      'context',
      'Błąd pobierania kontekstu firmowego',
      'connection refused'
    );
  });

  it('zwraca pusty string gdy brak wpisów', async () => {
    selectMock.mockResolvedValue({ data: [], error: null });

    const result = await getCompanyContext();

    expect(result).toBe('');
  });
});
