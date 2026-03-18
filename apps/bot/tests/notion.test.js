// Testy integracji z Notion API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/cache', () => ({
  withCache: jest.fn((_key, _ttl, fetcher) => fetcher()),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  isRedisEnabled: jest.fn().mockReturnValue(false),
  CACHE_TTL: { NOTION_SEARCH: 1800, NOTION_PAGE: 3600, PIPEDRIVE_SEARCH: 900, PIPEDRIVE_DEAL: 1800, PIPEDRIVE_NOTES: 1800, WORKFORCE_TIMELINE: 7200, CALENDAR_EVENTS: 1800, CALAMARI_ABSENCES: 3600, USER_NAME: 86400, CHANNEL_NAME: 86400 },
}));

// Mock @notionhq/client
const mockSearch = jest.fn();
const mockBlocksList = jest.fn();
jest.mock('@notionhq/client', () => ({
  Client: jest.fn(() => ({
    search: mockSearch,
    blocks: { children: { list: mockBlocksList } },
  })),
}));

// Ustaw token żeby klient się zainicjalizował
process.env.NOTION_TOKEN = 'secret_test';

const { searchNotion, getPageText, getPageTitle, buildContextFromNotion, extractKeywords } = require('../src/services/notion');

beforeEach(() => {
  mockSearch.mockReset();
  mockBlocksList.mockReset();
});

// --- extractKeywords ---

describe('extractKeywords', () => {
  it('usuwa polskie stop-words z pytania', () => {
    expect(extractKeywords('jakie KPI ma dział delivery w Momentum'))
      .toBe('kpi delivery momentum');
  });

  it('usuwa znaki interpunkcyjne', () => {
    expect(extractKeywords('co było napisane w ostatnim weekly?'))
      .toBe('weekly');
  });

  it('odrzuca jednoliterowe słowa i stop-words', () => {
    expect(extractKeywords('ja i ty na AI'))
      .toBe('ty ai');
  });

  it('zwraca pusty string dla samych stop-words', () => {
    expect(extractKeywords('co to jest?'))
      .toBe('');
  });

  it('usuwa filler words (zawiera, rok, powiedz)', () => {
    expect(extractKeywords('co zawiera strategia momentum na 2026 rok?'))
      .toBe('strategia momentum 2026');
  });

  it('limituje do 3 słów kluczowych', () => {
    expect(extractKeywords('KPI delivery finance growth momentum').split(' '))
      .toHaveLength(3);
  });

  it('usuwa angielskie stop-words z pytania', () => {
    expect(extractKeywords('what is the KPI for delivery'))
      .toBe('kpi delivery');
  });

  it('usuwa same angielskie stop-words', () => {
    expect(extractKeywords('tell me about the strategy'))
      .toBe('strategy');
  });

  it('obsługuje mix polskich i angielskich stop-words', () => {
    expect(extractKeywords('what jest the plan for projektu?'))
      .toBe('plan projektu');
  });

  it('zwraca pusty string dla samych angielskich stop-words', () => {
    expect(extractKeywords('what is the how can you'))
      .toBe('');
  });
});

// --- searchNotion ---

describe('searchNotion', () => {
  it('zwraca puste wyniki gdy Notion nic nie znalazł', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const result = await searchNotion('KPI delivery');
    expect(result).toEqual([]);
  });

  it('szuka po keywords zamiast pełnego zdania', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    await searchNotion('jakie KPI ma dział delivery?');
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'kpi delivery' })
    );
  });

  it('robi dwa zapytania gdy więcej niż 1 keyword', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    await searchNotion('strategia momentum');
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'strategia momentum' })
    );
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'strategia' })
    );
  });

  it('deduplikuje wyniki z dwóch zapytań', async () => {
    const page1 = { id: 'p1', properties: {} };
    const page2 = { id: 'p2', properties: {} };
    mockSearch
      .mockResolvedValueOnce({ results: [page1, page2] })
      .mockResolvedValueOnce({ results: [page1] });
    const result = await searchNotion('strategia momentum');
    expect(result).toHaveLength(2);
  });

  it('zwraca pustą tablicę gdy brak keywords', async () => {
    const result = await searchNotion('co to jest?');
    expect(result).toEqual([]);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('zwraca strony z wyników wyszukiwania', async () => {
    const pages = [{ id: 'page-1', properties: {} }, { id: 'page-2', properties: {} }];
    mockSearch.mockResolvedValue({ results: pages });
    const result = await searchNotion('KPI delivery');
    expect(result).toEqual(pages);
  });

  it('zwraca pustą tablicę przy błędzie API', async () => {
    mockSearch.mockRejectedValue(new Error('API error'));
    const result = await searchNotion('KPI delivery');
    expect(result).toEqual([]);
  });
});

// --- getPageText ---

describe('getPageText', () => {
  it('wyciąga tekst z paragrafów', async () => {
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Hello world' }] },
        has_children: false,
      }],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Hello world');
  });

  it('wyciąga tekst z headingów', async () => {
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'heading_1',
        heading_1: { rich_text: [{ plain_text: 'Tytuł' }] },
        has_children: false,
      }],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Tytuł');
  });

  it('wyciąga tekst z calloutów', async () => {
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'callout',
        callout: { rich_text: [{ plain_text: 'Ważne!' }] },
        has_children: false,
      }],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Ważne!');
  });

  it('łączy tekst z wielu bloków', async () => {
    mockBlocksList.mockResolvedValue({
      results: [
        { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Nagłówek' }] }, has_children: false },
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Treść' }] }, has_children: false },
      ],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Nagłówek Treść');
  });

  it('pobiera zagnieżdżone dzieci (tabele)', async () => {
    mockBlocksList
      .mockResolvedValueOnce({
        results: [{
          id: 'table-1',
          type: 'table',
          table: {},
          has_children: true,
        }],
      })
      .mockResolvedValueOnce({
        results: [
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'KPI' }], [{ plain_text: 'Wartość' }]] } },
          { type: 'table_row', table_row: { cells: [[{ plain_text: 'CES' }], [{ plain_text: '5.0' }]] } },
        ],
      });
    const text = await getPageText('page-1');
    expect(text).toContain('KPI | Wartość');
    expect(text).toContain('CES | 5.0');
  });

  it('pobiera dzieci calloutów', async () => {
    mockBlocksList
      .mockResolvedValueOnce({
        results: [{
          id: 'callout-1',
          type: 'callout',
          callout: { rich_text: [{ plain_text: 'Info:' }] },
          has_children: true,
        }],
      })
      .mockResolvedValueOnce({
        results: [{
          type: 'paragraph',
          paragraph: { rich_text: [{ plain_text: 'Szczegóły' }] },
          has_children: false,
        }],
      });
    const text = await getPageText('page-1');
    expect(text).toContain('Info:');
    expect(text).toContain('Szczegóły');
  });

  it('pomija bloki bez tekstu', async () => {
    mockBlocksList.mockResolvedValue({
      results: [
        { type: 'paragraph', paragraph: { rich_text: [] }, has_children: false },
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Coś' }] }, has_children: false },
      ],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Coś');
  });

  it('obcina tekst do 1500 znaków', async () => {
    const longText = 'A'.repeat(2000);
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: longText }] },
        has_children: false,
      }],
    });
    const text = await getPageText('page-1');
    expect(text.length).toBe(1500);
  });

  it('zwraca pusty string przy błędzie API', async () => {
    mockBlocksList.mockRejectedValue(new Error('API error'));
    const text = await getPageText('page-1');
    expect(text).toBe('');
  });
});

// --- getPageTitle ---

describe('getPageTitle', () => {
  it('wyciąga tytuł z properties', () => {
    const page = {
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Moja strona' }] },
      },
    };
    expect(getPageTitle(page)).toBe('Moja strona');
  });

  it('zwraca "Bez tytułu" gdy brak title', () => {
    const page = { properties: { Status: { type: 'select' } } };
    expect(getPageTitle(page)).toBe('Bez tytułu');
  });

  it('zwraca "Bez tytułu" gdy brak properties', () => {
    expect(getPageTitle({})).toBe('Bez tytułu');
  });

  it('łączy wiele fragmentów tytułu', () => {
    const page = {
      properties: {
        Title: {
          type: 'title',
          title: [{ plain_text: 'Część ' }, { plain_text: 'tytułu' }],
        },
      },
    };
    expect(getPageTitle(page)).toBe('Część tytułu');
  });
});

// --- buildContextFromNotion ---

describe('buildContextFromNotion', () => {
  it('zwraca pusty string gdy brak stron', async () => {
    const result = await buildContextFromNotion([]);
    expect(result).toBe('');
  });

  it('buduje kontekst z jednej strony', async () => {
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Treść strony' }] },
        has_children: false,
      }],
    });

    const pages = [{
      id: 'page-1',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Docs' }] } },
    }];

    const result = await buildContextFromNotion(pages);
    expect(result).toContain('KONTEKST Z NOTION');
    expect(result).toContain('[Docs]: Treść strony');
  });

  it('pomija strony bez treści', async () => {
    mockBlocksList.mockResolvedValue({ results: [] });

    const pages = [{
      id: 'page-1',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Pusta' }] } },
    }];

    const result = await buildContextFromNotion(pages);
    expect(result).toBe('');
  });

  it('limituje do 3 stron', async () => {
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: 'Tekst' }] },
        has_children: false,
      }],
    });

    const pages = Array.from({ length: 5 }, (_, i) => ({
      id: `page-${i}`,
      properties: { Name: { type: 'title', title: [{ plain_text: `Strona ${i}` }] } },
    }));

    const result = await buildContextFromNotion(pages);
    expect(result).toContain('Strona 0');
    expect(result).toContain('Strona 2');
    expect(result).not.toContain('Strona 3');
  });
});
