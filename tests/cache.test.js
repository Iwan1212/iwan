// Testy modułu cache Redis
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

// Mock ioredis
const mockGet = jest.fn();
const mockSetex = jest.fn();
const mockKeys = jest.fn();
const mockDel = jest.fn();
const mockQuit = jest.fn();
const mockOn = jest.fn();

const mockRedisInstance = {
  get: mockGet,
  setex: mockSetex,
  keys: mockKeys,
  del: mockDel,
  quit: mockQuit,
  on: mockOn,
  status: 'ready',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Ustaw REDIS_URL przed importem modułu
process.env.REDIS_URL = 'redis://localhost:6379';

const { isRedisEnabled, getCache, setCache, withCache, invalidateCache, disconnectCache, CACHE_TTL } = require('../src/services/cache');

beforeEach(() => {
  mockGet.mockReset();
  mockSetex.mockReset();
  mockKeys.mockReset();
  mockDel.mockReset();
  mockQuit.mockReset();
});

// --- CACHE_TTL ---

describe('CACHE_TTL', () => {
  it('wszystkie wartości są pozytywnymi liczbami', () => {
    for (const [key, val] of Object.entries(CACHE_TTL)) {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThan(0);
    }
  });

  it('zawiera klucze dla wszystkich serwisów', () => {
    expect(CACHE_TTL).toHaveProperty('NOTION_SEARCH');
    expect(CACHE_TTL).toHaveProperty('NOTION_PAGE');
    expect(CACHE_TTL).toHaveProperty('PIPEDRIVE_SEARCH');
    expect(CACHE_TTL).toHaveProperty('PIPEDRIVE_DEAL');
    expect(CACHE_TTL).toHaveProperty('PIPEDRIVE_NOTES');
    expect(CACHE_TTL).toHaveProperty('WORKFORCE_TIMELINE');
    expect(CACHE_TTL).toHaveProperty('CALENDAR_EVENTS');
    expect(CACHE_TTL).toHaveProperty('CALAMARI_ABSENCES');
    expect(CACHE_TTL).toHaveProperty('USER_NAME');
    expect(CACHE_TTL).toHaveProperty('CHANNEL_NAME');
  });
});

// --- isRedisEnabled ---

describe('isRedisEnabled', () => {
  it('zwraca true gdy Redis jest ready', () => {
    mockRedisInstance.status = 'ready';
    expect(isRedisEnabled()).toBe(true);
  });

  it('zwraca false gdy Redis nie jest ready', () => {
    const orig = mockRedisInstance.status;
    mockRedisInstance.status = 'connecting';
    expect(isRedisEnabled()).toBe(false);
    mockRedisInstance.status = orig;
  });
});

// --- getCache ---

describe('getCache', () => {
  it('zwraca sparsowaną wartość przy cache hit', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ name: 'test' }));
    const result = await getCache('test:key');
    expect(result).toEqual({ name: 'test' });
    expect(mockGet).toHaveBeenCalledWith('test:key');
  });

  it('zwraca null przy cache miss', async () => {
    mockGet.mockResolvedValue(null);
    const result = await getCache('missing:key');
    expect(result).toBeNull();
  });

  it('zwraca null przy błędzie Redis (graceful)', async () => {
    mockGet.mockRejectedValue(new Error('Connection refused'));
    const result = await getCache('error:key');
    expect(result).toBeNull();
  });

  it('parsuje tablicę z cache', async () => {
    mockGet.mockResolvedValue(JSON.stringify([1, 2, 3]));
    const result = await getCache('array:key');
    expect(result).toEqual([1, 2, 3]);
  });

  it('parsuje string z cache', async () => {
    mockGet.mockResolvedValue(JSON.stringify('hello'));
    const result = await getCache('string:key');
    expect(result).toBe('hello');
  });
});

// --- setCache ---

describe('setCache', () => {
  it('zapisuje wartość z poprawnym TTL', async () => {
    mockSetex.mockResolvedValue('OK');
    await setCache('test:key', { data: 'value' }, 300);
    expect(mockSetex).toHaveBeenCalledWith('test:key', 300, JSON.stringify({ data: 'value' }));
  });

  it('nie rzuca błędu przy problemie z Redis (silent)', async () => {
    mockSetex.mockRejectedValue(new Error('Connection refused'));
    await expect(setCache('error:key', 'val', 60)).resolves.toBeUndefined();
  });

  it('serializuje tablicę poprawnie', async () => {
    mockSetex.mockResolvedValue('OK');
    await setCache('arr:key', [1, 2], 60);
    expect(mockSetex).toHaveBeenCalledWith('arr:key', 60, '[1,2]');
  });
});

// --- withCache ---

describe('withCache', () => {
  it('zwraca wartość z cache i NIE woła fetchera', async () => {
    mockGet.mockResolvedValue(JSON.stringify({ cached: true }));
    const fetcher = jest.fn();
    const result = await withCache('hit:key', 300, fetcher);
    expect(result).toEqual({ cached: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('woła fetchera przy cache miss i zapisuje wynik', async () => {
    mockGet.mockResolvedValue(null);
    mockSetex.mockResolvedValue('OK');
    const fetcher = jest.fn().mockResolvedValue({ fresh: true });

    const result = await withCache('miss:key', 300, fetcher);
    expect(result).toEqual({ fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockSetex).toHaveBeenCalledWith('miss:key', 300, JSON.stringify({ fresh: true }));
  });

  it('woła fetchera gdy Redis rzuca błąd', async () => {
    mockGet.mockRejectedValue(new Error('Redis down'));
    const fetcher = jest.fn().mockResolvedValue({ fallback: true });

    const result = await withCache('error:key', 300, fetcher);
    expect(result).toEqual({ fallback: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('nie zapisuje null do cache', async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(null);

    const result = await withCache('null:key', 300, fetcher);
    expect(result).toBeNull();
    expect(mockSetex).not.toHaveBeenCalled();
  });

  it('nie zapisuje undefined do cache', async () => {
    mockGet.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(undefined);

    const result = await withCache('undef:key', 300, fetcher);
    expect(result).toBeUndefined();
    expect(mockSetex).not.toHaveBeenCalled();
  });
});

// --- invalidateCache ---

describe('invalidateCache', () => {
  it('znajduje i usuwa klucze pasujące do wzorca', async () => {
    mockKeys.mockResolvedValue(['pipedrive:notes:42:1', 'pipedrive:notes:42:2']);
    mockDel.mockResolvedValue(2);

    await invalidateCache('pipedrive:notes:42:*');
    expect(mockKeys).toHaveBeenCalledWith('pipedrive:notes:42:*');
    expect(mockDel).toHaveBeenCalledWith('pipedrive:notes:42:1', 'pipedrive:notes:42:2');
  });

  it('nie woła del gdy brak pasujących kluczy', async () => {
    mockKeys.mockResolvedValue([]);
    await invalidateCache('nonexistent:*');
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('nie rzuca błędu przy problemie z Redis', async () => {
    mockKeys.mockRejectedValue(new Error('Redis down'));
    await expect(invalidateCache('error:*')).resolves.toBeUndefined();
  });
});

// --- disconnectCache ---

describe('disconnectCache', () => {
  it('woła redis.quit()', async () => {
    mockQuit.mockResolvedValue('OK');
    await disconnectCache();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it('nie rzuca błędu przy problemie z quit', async () => {
    mockQuit.mockRejectedValue(new Error('Already closed'));
    await expect(disconnectCache()).resolves.toBeUndefined();
  });
});
