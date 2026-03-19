// Testy klasyfikacji kanalow (access level + label)
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: (...args) => {
      mockFrom(...args);
      return {
        select: (...a) => { mockSelect(...a); return { eq: (...b) => { mockEq(...b); return { single: () => mockSingle() }; } }; },
        upsert: (...a) => mockUpsert(...a),
      };
    },
  },
}));

jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

// Mock cache — zawsze miss (wymusza Supabase call)
jest.mock('../src/services/cache', () => ({
  withCache: jest.fn(async (_key, _ttl, fetcher) => fetcher()),
}));

// Mock membership
const mockIsUserInChannel = jest.fn();
jest.mock('../src/services/membership', () => ({
  isUserInChannel: (...args) => mockIsUserInChannel(...args),
}));

const {
  getChannelAccessLevel,
  getChannelLabel,
  canUserAccessChannel,
  setChannelAccessLevel,
} = require('../src/services/channelClassification');

describe('getChannelAccessLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('zwraca access_level z Supabase', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C123', access_level: 'open', label: 'general' },
      error: null,
    });

    const result = await getChannelAccessLevel('C123');
    expect(result).toBe('open');
    expect(mockFrom).toHaveBeenCalledWith('channel_access_levels');
  });

  it('zwraca domyslnie restricted gdy kanal nie ma rekordu', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const result = await getChannelAccessLevel('C_UNKNOWN');
    expect(result).toBe('restricted');
  });

  it('zwraca restricted przy bledzie Supabase', async () => {
    mockSingle.mockRejectedValue(new Error('DB timeout'));

    const result = await getChannelAccessLevel('C_ERROR');
    expect(result).toBe('restricted');
  });
});

describe('getChannelLabel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('zwraca label kanalu', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C123', access_level: 'restricted', label: 'leadership' },
      error: null,
    });

    const result = await getChannelLabel('C123');
    expect(result).toBe('leadership');
  });

  it('zwraca null gdy kanal nie ma labela', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C123', access_level: 'open', label: null },
      error: null,
    });

    const result = await getChannelLabel('C123');
    expect(result).toBeNull();
  });

  it('zwraca null gdy kanal nie istnieje w tabeli', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const result = await getChannelLabel('C_MISSING');
    expect(result).toBeNull();
  });
});

describe('canUserAccessChannel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('zwraca true gdy source === target (wlasny kanal)', async () => {
    const result = await canUserAccessChannel({}, 'U123', 'C456', 'C456');
    expect(result).toBe(true);
    // Nie powinien odpytywac niczego
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockIsUserInChannel).not.toHaveBeenCalled();
  });

  it('zwraca true gdy kanal docelowy jest open', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C_TARGET', access_level: 'open', label: null },
      error: null,
    });

    const result = await canUserAccessChannel({}, 'U123', 'C_SOURCE', 'C_TARGET');
    expect(result).toBe(true);
    expect(mockIsUserInChannel).not.toHaveBeenCalled();
  });

  it('sprawdza membership gdy kanal jest restricted', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C_TARGET', access_level: 'restricted', label: 'leadership' },
      error: null,
    });
    mockIsUserInChannel.mockResolvedValue(true);

    const app = {};
    const result = await canUserAccessChannel(app, 'U123', 'C_SOURCE', 'C_TARGET');

    expect(result).toBe(true);
    expect(mockIsUserInChannel).toHaveBeenCalledWith(app, 'U123', 'C_TARGET');
  });

  it('zwraca false gdy kanal restricted i user nie jest czlonkiem', async () => {
    mockSingle.mockResolvedValue({
      data: { channel_id: 'C_TARGET', access_level: 'restricted', label: 'leadership' },
      error: null,
    });
    mockIsUserInChannel.mockResolvedValue(false);

    const result = await canUserAccessChannel({}, 'U123', 'C_SOURCE', 'C_TARGET');
    expect(result).toBe(false);
  });

  it('domyslnie restricted gdy kanal nie ma rekordu w tabeli', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    mockIsUserInChannel.mockResolvedValue(false);

    const result = await canUserAccessChannel({}, 'U123', 'C_SOURCE', 'C_NEW');
    expect(result).toBe(false);
    expect(mockIsUserInChannel).toHaveBeenCalled();
  });
});

describe('setChannelAccessLevel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upsertuje access level do Supabase', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    const result = await setChannelAccessLevel('C123', 'open', 'general');

    expect(result).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('channel_access_levels');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        channel_id: 'C123',
        access_level: 'open',
        label: 'general',
      }),
    );
  });

  it('zwraca false przy bledzie Supabase', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'DB error' } });

    const result = await setChannelAccessLevel('C123', 'restricted');
    expect(result).toBe(false);
  });

  it('ustawia label null gdy nie podany', async () => {
    mockUpsert.mockResolvedValue({ error: null });

    await setChannelAccessLevel('C123', 'restricted');

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.label).toBeNull();
  });
});
