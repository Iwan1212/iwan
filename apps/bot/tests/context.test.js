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
let getCompanyContext, matchTopics;
beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../src/services/context');
    getCompanyContext = mod.getCompanyContext;
    matchTopics = mod.matchTopics;
  });
  selectMock.mockReset();
  logError.mockReset();
});

// --- matchTopics ---

describe('matchTopics', () => {
  it('dopasowuje temat struktura-organizacyjna', () => {
    expect(matchTopics('kto jest CEO?')).toContain('struktura-organizacyjna');
  });

  it('dopasowuje temat strategia-2026', () => {
    expect(matchTopics('jaka jest strategia na 2026?')).toContain('strategia-2026');
  });

  it('dopasowuje temat brand-book', () => {
    expect(matchTopics('jakie kolory ma logo?')).toContain('brand-book');
  });

  it('dopasowuje temat testimoniale', () => {
    expect(matchTopics('pokaż opinie klientów')).toContain('testimoniale');
  });

  it('dopasowuje wiele tematów naraz', () => {
    const result = matchTopics('kto odpowiada za strategię i brand?');
    expect(result).toContain('struktura-organizacyjna');
    expect(result).toContain('brand-book');
  });

  it('fallback do struktura-organizacyjna gdy nic nie pasuje', () => {
    expect(matchTopics('jaka jest pogoda?')).toEqual(['struktura-organizacyjna']);
  });

  it('jest case-insensitive', () => {
    expect(matchTopics('KTO jest CEO?')).toContain('struktura-organizacyjna');
  });

  it('obsługuje interpunkcję', () => {
    expect(matchTopics('strategia!')).toContain('strategia-2026');
  });

  it('dopasowuje angielskie keywords', () => {
    expect(matchTopics('what is the KPI?')).toContain('strategia-2026');
  });
});

// --- getCompanyContext (istniejące testy — backward compatible) ---

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

// --- getCompanyContext z query (selektywne ładowanie) ---

describe('getCompanyContext z query', () => {
  const allData = [
    { topic: 'struktura-organizacyjna', content: 'CEO: Jan Kowalski' },
    { topic: 'strategia-2026', content: 'Wzrost 50% YoY' },
    { topic: 'brand-book', content: 'Kolor: #FF0000' },
    { topic: 'testimoniale', content: 'Świetna firma!' },
  ];

  it('ładuje tylko pasujące tematy', async () => {
    selectMock.mockResolvedValue({ data: allData, error: null });

    const result = await getCompanyContext('jaka jest strategia?');

    expect(result).toContain('[strategia-2026]');
    expect(result).not.toContain('[struktura-organizacyjna]');
    expect(result).not.toContain('[brand-book]');
    expect(result).not.toContain('[testimoniale]');
  });

  it('bez query zwraca wszystko (backward compatible)', async () => {
    selectMock.mockResolvedValue({ data: allData, error: null });

    const result = await getCompanyContext();

    expect(result).toContain('[struktura-organizacyjna]');
    expect(result).toContain('[strategia-2026]');
    expect(result).toContain('[brand-book]');
    expect(result).toContain('[testimoniale]');
  });

  it('fallback do struktura-organizacyjna gdy nic nie pasuje', async () => {
    selectMock.mockResolvedValue({ data: allData, error: null });

    const result = await getCompanyContext('jaka jest pogoda?');

    expect(result).toContain('[struktura-organizacyjna]');
    expect(result).not.toContain('[strategia-2026]');
  });

  it('zwraca pusty string gdy DB jest pusta', async () => {
    selectMock.mockResolvedValue({ data: [], error: null });

    const result = await getCompanyContext('strategia');

    expect(result).toBe('');
  });
});
