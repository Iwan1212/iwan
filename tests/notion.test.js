// Testy integracji z Notion API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

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

const { searchNotion, getPageText, getPageTitle, buildContextFromNotion } = require('../src/services/notion');

beforeEach(() => {
  mockSearch.mockReset();
  mockBlocksList.mockReset();
});

// --- searchNotion ---

describe('searchNotion', () => {
  it('zwraca puste wyniki gdy Notion nic nie znalazł', async () => {
    mockSearch.mockResolvedValue({ results: [] });
    const result = await searchNotion('test');
    expect(result).toEqual([]);
  });

  it('zwraca strony z wyników wyszukiwania', async () => {
    const pages = [{ id: 'page-1', properties: {} }, { id: 'page-2', properties: {} }];
    mockSearch.mockResolvedValue({ results: pages });
    const result = await searchNotion('projekt');
    expect(result).toEqual(pages);
    expect(mockSearch).toHaveBeenCalledWith({
      query: 'projekt',
      filter: { property: 'object', value: 'page' },
      page_size: 3,
    });
  });

  it('zwraca pustą tablicę przy błędzie API', async () => {
    mockSearch.mockRejectedValue(new Error('API error'));
    const result = await searchNotion('test');
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
      }],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Tytuł');
  });

  it('łączy tekst z wielu bloków', async () => {
    mockBlocksList.mockResolvedValue({
      results: [
        { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Nagłówek' }] } },
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Treść' }] } },
      ],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Nagłówek Treść');
  });

  it('pomija bloki bez tekstu', async () => {
    mockBlocksList.mockResolvedValue({
      results: [
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Coś' }] } },
      ],
    });
    const text = await getPageText('page-1');
    expect(text).toBe('Coś');
  });

  it('obcina tekst do 500 znaków', async () => {
    const longText = 'A'.repeat(600);
    mockBlocksList.mockResolvedValue({
      results: [{
        type: 'paragraph',
        paragraph: { rich_text: [{ plain_text: longText }] },
      }],
    });
    const text = await getPageText('page-1');
    expect(text.length).toBe(500);
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
