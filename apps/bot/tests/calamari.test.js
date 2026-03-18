// Testy integracji z Calamari API
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/cache', () => ({
  withCache: jest.fn((_key, _ttl, fetcher) => fetcher()),
  getCache: jest.fn().mockResolvedValue(null),
  setCache: jest.fn().mockResolvedValue(undefined),
  invalidateCache: jest.fn().mockResolvedValue(undefined),
  isRedisEnabled: jest.fn().mockReturnValue(false),
  CACHE_TTL: { NOTION_SEARCH: 1800, NOTION_PAGE: 3600, PIPEDRIVE_SEARCH: 900, PIPEDRIVE_DEAL: 1800, PIPEDRIVE_NOTES: 1800, WORKFORCE_TIMELINE: 7200, CALENDAR_EVENTS: 1800, CALAMARI_ABSENCES: 3600, USER_NAME: 86400, CHANNEL_NAME: 86400 },
}));

// Mock fetch globalnie
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Ustaw env przed importem
process.env.CALAMARI_URL = 'https://test.calamari.io';
process.env.CALAMARI_API_KEY = 'test-api-key';

const { calamariFetch, getAbsences, buildContextFromCalamari } = require('../src/services/calamari');

describe('calamariFetch', () => {
  beforeEach(() => mockFetch.mockReset());

  it('wysyła POST z Basic Auth', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await calamariFetch('/api/test', { foo: 'bar' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.calamari.io/api/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': expect.stringContaining('Basic '),
        }),
      })
    );
  });

  it('rzuca błąd przy nieudanym request', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    await expect(calamariFetch('/api/test')).rejects.toThrow('401');
  });
});

describe('getAbsences', () => {
  beforeEach(() => mockFetch.mockReset());

  it('filtruje tylko zaakceptowane nieobecności', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 1, status: 'ACCEPTED', employeeEmail: 'jan@test.pl' },
        { id: 2, status: 'CANCELED', employeeEmail: 'anna@test.pl' },
        { id: 3, status: 'ACCEPTED', employeeEmail: 'bob@test.pl' },
      ]),
    });

    const result = await getAbsences('2026-03-01', '2026-03-31');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.status === 'ACCEPTED')).toBe(true);
  });
});

describe('buildContextFromCalamari', () => {
  it('zwraca pusty string dla braku danych', () => {
    expect(buildContextFromCalamari(null)).toBe('');
    expect(buildContextFromCalamari([])).toBe('');
  });

  it('buduje kontekst z nieobecności pogrupowany po osobach', () => {
    const absences = [
      {
        employeeEmail: 'jan.kowalski@test.pl',
        absenceTypeName: 'Urlop wypoczynkowy',
        from: '2026-03-10',
        to: '2026-03-14',
        entitlementAmount: 5,
        status: 'ACCEPTED',
      },
      {
        employeeEmail: 'anna.nowak@test.pl',
        absenceTypeName: 'Praca zdalna',
        from: '2026-03-12',
        to: '2026-03-12',
        entitlementAmount: 1,
        status: 'ACCEPTED',
      },
    ];

    const result = buildContextFromCalamari(absences);
    expect(result).toContain('KONTEKST Z CALAMARI');
    expect(result).toContain('jan kowalski');
    expect(result).toContain('anna nowak');
    expect(result).toContain('Urlop wypoczynkowy');
    expect(result).toContain('2026-03-10');
  });
});
