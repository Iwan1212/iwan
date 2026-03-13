// Testy daily deal digest
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null })),
          order: jest.fn(() => ({
            limit: jest.fn(() => ({
              gt: jest.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
        order: jest.fn(() => ({
          limit: jest.fn(() => ({
            gt: jest.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/pipedrive', () => ({
  getActiveDeals: jest.fn(() => Promise.resolve([])),
  getDealNotes: jest.fn(() => Promise.resolve([])),
  findAgentNote: jest.fn(() => null),
  createNote: jest.fn(() => Promise.resolve({ id: 1 })),
  updateNote: jest.fn(() => Promise.resolve({ id: 1 })),
  createActivity: jest.fn(() => Promise.resolve({ id: 1 })),
}));
jest.mock('../src/services/dealResolver', () => ({
  resolveChannelToDeal: jest.fn(),
  resolveThreadToDeal: jest.fn(),
  getChannelsForDeal: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: jest.fn() },
  }));
});

process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.PIPEDRIVE_API_TOKEN = 'test-token';

const {
  isDigestTime,
  computeMessageHash,
  formatMessages,
} = require('../src/services/dealDigest');

// --- isDigestTime ---

describe('isDigestTime', () => {
  it('zwraca true dla poniedziałku o 7:00', () => {
    // 2026-03-16 to poniedziałek
    const monday7am = new Date(2026, 2, 16, 7, 0, 0);
    expect(isDigestTime(monday7am)).toBe(true);
  });

  it('zwraca true dla piątku o 7:00', () => {
    const friday7am = new Date(2026, 2, 20, 7, 0, 0);
    expect(isDigestTime(friday7am)).toBe(true);
  });

  it('zwraca false dla soboty', () => {
    const saturday = new Date(2026, 2, 21, 7, 0, 0);
    expect(isDigestTime(saturday)).toBe(false);
  });

  it('zwraca false dla niedzieli', () => {
    const sunday = new Date(2026, 2, 22, 7, 0, 0);
    expect(isDigestTime(sunday)).toBe(false);
  });

  it('zwraca false dla złej godziny', () => {
    const monday10am = new Date(2026, 2, 16, 10, 0, 0);
    expect(isDigestTime(monday10am)).toBe(false);
  });
});

// --- computeMessageHash ---

describe('computeMessageHash', () => {
  it('generuje hash z wiadomości', () => {
    const messages = [
      { user_id: 'U1', message_text: 'hello' },
      { user_id: 'U2', message_text: 'world' },
    ];
    const hash = computeMessageHash(messages);
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(32); // MD5 hex
  });

  it('generuje ten sam hash dla tych samych wiadomości', () => {
    const msgs = [{ user_id: 'U1', message_text: 'test' }];
    expect(computeMessageHash(msgs)).toBe(computeMessageHash(msgs));
  });

  it('generuje różne hashe dla różnych wiadomości', () => {
    const msgs1 = [{ user_id: 'U1', message_text: 'hello' }];
    const msgs2 = [{ user_id: 'U1', message_text: 'world' }];
    expect(computeMessageHash(msgs1)).not.toBe(computeMessageHash(msgs2));
  });
});

// --- formatMessages ---

describe('formatMessages', () => {
  it('formatuje wiadomości do tekstu', () => {
    const messages = [
      { user_name: 'Jan', message_text: 'Cześć', created_at: '2026-03-13T10:00:00Z' },
      { user_name: 'Anna', message_text: 'Hej', created_at: '2026-03-13T10:05:00Z' },
    ];
    const text = formatMessages(messages);
    expect(text).toContain('Jan');
    expect(text).toContain('Cześć');
    expect(text).toContain('Anna');
    expect(text).toContain('Hej');
  });

  it('używa user_id jako fallback nazwy', () => {
    const messages = [
      { user_id: 'U123', message_text: 'test', created_at: '2026-03-13T10:00:00Z' },
    ];
    const text = formatMessages(messages);
    expect(text).toContain('U123');
  });

  it('zwraca pusty string dla pustej tablicy', () => {
    expect(formatMessages([])).toBe('');
  });
});
