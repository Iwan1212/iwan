// Testy deal resolver — mapowanie kanałów Slack na deale Pipedrive
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          limit: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      })),
      upsert: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/pipedrive', () => ({
  searchDeals: jest.fn(),
  getDeal: jest.fn(),
}));
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.DEAL_SALES_PREFIX = 'sales-';

const { searchDeals, getDeal } = require('../src/services/pipedrive');

// Re-import po mockach
const { resolveChannelToDeal, resolveThreadToDeal } = require('../src/services/dealResolver');

beforeEach(() => {
  jest.clearAllMocks();
});

// --- resolveChannelToDeal ---

describe('resolveChannelToDeal', () => {
  it('rozwiązuje kanał #sales-acme na deal Acme', async () => {
    searchDeals.mockResolvedValue([
      { id: 1, title: 'Acme Deal', status: 'open', org_name: 'Acme' },
    ]);

    const deal = await resolveChannelToDeal('sales-acme', 'C123');
    expect(deal).not.toBeNull();
    expect(deal.title).toBe('Acme Deal');
    expect(searchDeals).toHaveBeenCalledWith('acme');
  });

  it('zwraca null gdy brak deali w Pipedrive', async () => {
    searchDeals.mockResolvedValue([]);

    const deal = await resolveChannelToDeal('sales-unknown', 'C456');
    expect(deal).toBeNull();
  });

  it('stripuje prefix z nazwy kanału', async () => {
    searchDeals.mockResolvedValue([
      { id: 2, title: 'Globex Deal', status: 'open' },
    ]);

    await resolveChannelToDeal('sales-globex', 'C789');
    expect(searchDeals).toHaveBeenCalledWith('globex');
  });

  it('preferuje otwarte deale', async () => {
    searchDeals.mockResolvedValue([
      { id: 1, title: 'Old Deal', status: 'lost' },
      { id: 2, title: 'New Deal', status: 'open' },
    ]);

    const deal = await resolveChannelToDeal('sales-test', 'C001');
    // Jeden otwarty deal — powinien zwrócić go bezpośrednio
    expect(deal).not.toBeNull();
    expect(deal.id).toBe(2);
  });
});

// --- resolveThreadToDeal ---

describe('resolveThreadToDeal', () => {
  it('zwraca null dla pustych wiadomości', async () => {
    const deal = await resolveThreadToDeal([], 'channel', 'C123', '1234.5678');
    expect(deal).toBeNull();
  });

  it('zwraca null dla wiadomości bez tekstu', async () => {
    const messages = [{ text: '' }];
    const deal = await resolveThreadToDeal(messages, 'channel', 'C123', '1234.5678');
    expect(deal).toBeNull();
  });
});
