// Testy integracji z Pipedrive CRM API
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

process.env.PIPEDRIVE_API_TOKEN = 'test-token-123';
process.env.PIPEDRIVE_DOMAIN = 'test-company';

const {
  isPipedriveEnabled,
  searchDeals,
  getDeal,
  getActiveDeals,
  getDealNotes,
  findAgentNote,
  createNote,
  updateNote,
  createActivity,
  buildContextFromDeal,
  buildContextFromDeals,
} = require('../src/services/pipedrive');

beforeEach(() => {
  mockFetch.mockReset();
});

// --- isPipedriveEnabled ---

describe('isPipedriveEnabled', () => {
  it('zwraca true gdy token jest ustawiony', () => {
    expect(isPipedriveEnabled()).toBe(true);
  });
});

// --- searchDeals ---

describe('searchDeals', () => {
  it('zwraca listę deali po wyszukaniu', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          items: [
            {
              item: {
                id: 1, title: 'Acme Deal', status: 'open',
                organization: { name: 'Acme Corp' },
                owner: { name: 'Jan' },
                stage: { name: 'Negocjacje' },
                value: 50000, currency: 'PLN',
              },
            },
          ],
        },
      }),
    });

    const deals = await searchDeals('Acme');
    expect(deals).toHaveLength(1);
    expect(deals[0].title).toBe('Acme Deal');
    expect(deals[0].org_name).toBe('Acme Corp');
    expect(deals[0].status).toBe('open');
  });

  it('zwraca pustą tablicę przy błędzie API', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const deals = await searchDeals('Acme');
    expect(deals).toEqual([]);
  });

  it('zwraca pustą tablicę gdy brak wyników', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { items: [] } }),
    });
    const deals = await searchDeals('NonExistent');
    expect(deals).toEqual([]);
  });
});

// --- getDeal ---

describe('getDeal', () => {
  it('zwraca deal po ID', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: 42, title: 'Test Deal', status: 'open' },
      }),
    });

    const deal = await getDeal(42);
    expect(deal).not.toBeNull();
    expect(deal.id).toBe(42);
    expect(deal.title).toBe('Test Deal');
  });

  it('zwraca null przy błędzie', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const deal = await getDeal(999);
    expect(deal).toBeNull();
  });
});

// --- getDealNotes ---

describe('getDealNotes', () => {
  it('zwraca notatki deala', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 1, content: '<b>Note 1</b>' },
          { id: 2, content: '<b>[Slack Summary] 2026-03-10</b>' },
        ],
      }),
    });

    const notes = await getDealNotes(42);
    expect(notes).toHaveLength(2);
  });

  it('zwraca pustą tablicę przy błędzie', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const notes = await getDealNotes(42);
    expect(notes).toEqual([]);
  });
});

// --- findAgentNote ---

describe('findAgentNote', () => {
  it('znajduje notatkę z prefixem [Slack Summary]', () => {
    const notes = [
      { id: 1, content: 'Regular note' },
      { id: 2, content: '<b>[Slack Summary] 2026-03-10</b><br>Summary here' },
    ];
    const found = findAgentNote(notes);
    expect(found).not.toBeNull();
    expect(found.id).toBe(2);
  });

  it('zwraca null gdy brak notatki agenta', () => {
    const notes = [{ id: 1, content: 'Regular note' }];
    expect(findAgentNote(notes)).toBeNull();
  });

  it('zwraca null dla pustej tablicy', () => {
    expect(findAgentNote([])).toBeNull();
  });
});

// --- createNote ---

describe('createNote', () => {
  it('tworzy notatkę na dealu', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 100 } }),
    });

    const note = await createNote(42, '<b>Test note</b>');
    expect(note).not.toBeNull();
    expect(note.id).toBe(100);
  });

  it('zwraca null przy błędzie', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const note = await createNote(42, 'content');
    expect(note).toBeNull();
  });
});

// --- createActivity ---

describe('createActivity', () => {
  it('tworzy aktywność na dealu', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 200, subject: 'Follow up' } }),
    });

    const activity = await createActivity(42, 'Follow up');
    expect(activity).not.toBeNull();
    expect(activity.subject).toBe('Follow up');
  });
});

// --- buildContextFromDeal ---

describe('buildContextFromDeal', () => {
  it('buduje kontekst z danych deala', () => {
    const deal = {
      title: 'Acme Deal', status: 'open', value: 50000, currency: 'PLN',
      owner_name: 'Jan', org_name: 'Acme Corp', stage_id: 3,
    };
    const context = buildContextFromDeal(deal);
    expect(context).toContain('Acme Deal');
    expect(context).toContain('50000');
    expect(context).toContain('Jan');
    expect(context).toContain('PIPEDRIVE CRM');
  });

  it('zawiera notatki w kontekście', () => {
    const deal = { title: 'Deal', status: 'open' };
    const notes = [{ content: '<b>Important note</b>' }];
    const context = buildContextFromDeal(deal, notes);
    expect(context).toContain('OSTATNIE NOTATKI');
    expect(context).toContain('Important note');
  });

  it('zwraca pusty string dla null', () => {
    expect(buildContextFromDeal(null)).toBe('');
  });
});

// --- buildContextFromDeals ---

describe('buildContextFromDeals', () => {
  it('buduje kontekst z listy deali', () => {
    const deals = [
      { id: 1, title: 'Deal A', status: 'open', value: 10000, currency: 'PLN' },
      { id: 2, title: 'Deal B', status: 'open', stage: 'Negocjacje' },
    ];
    const context = buildContextFromDeals(deals);
    expect(context).toContain('Deal A');
    expect(context).toContain('Deal B');
    expect(context).toContain('10000');
  });

  it('zwraca komunikat dla pustej tablicy', () => {
    const context = buildContextFromDeals([]);
    expect(context).toContain('Nie znaleziono');
  });
});
