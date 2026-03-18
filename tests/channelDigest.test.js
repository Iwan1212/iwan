// Testy channel digest — codzienny raport aktywności kanałów
jest.mock('../src/services/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gt: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/llm', () => ({
  ask: jest.fn(() => Promise.resolve('Podsumowanie testowe.')),
}));

process.env.CHANNEL_DIGEST_ENABLED = 'true';
process.env.CHANNEL_DIGEST_CHANNEL = 'C_DIGEST';
process.env.CHANNEL_DIGEST_CHANNELS = 'general,team';

const { fetchChannelActivity, detectUnansweredQuestions, generateChannelSummary, runChannelDigest } = require('../src/services/channelDigest');
const { supabase } = require('../src/services/supabase');
const { ask } = require('../src/services/llm');
const { logError } = require('../src/services/errors');

// --- detectUnansweredQuestions ---

describe('detectUnansweredQuestions', () => {
  it('wykrywa pytania bez odpowiedzi', () => {
    const messages = [
      { user_name: 'Jan', text: 'Kto obsługuje klienta ABC?' },
      { user_name: 'Anna', text: 'Dzień dobry!' },
      { user_name: 'Piotr', text: 'Kiedy mamy deadline?' },
    ];
    const result = detectUnansweredQuestions(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Jan');
    expect(result[1]).toContain('Piotr');
  });

  it('zwraca pustą listę gdy brak pytań', () => {
    const messages = [
      { user_name: 'Jan', text: 'Cześć' },
      { user_name: 'Anna', text: 'Hej!' },
    ];
    expect(detectUnansweredQuestions(messages)).toEqual([]);
  });

  it('ogranicza wyniki do max 5 pytań', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      user_name: `User${i}`,
      text: `Pytanie numer ${i}?`,
    }));
    expect(detectUnansweredQuestions(messages)).toHaveLength(5);
  });

  it('ucina tekst pytania do 100 znaków', () => {
    const longText = 'A'.repeat(200) + '?';
    const messages = [{ user_name: 'Jan', text: longText }];
    const result = detectUnansweredQuestions(messages);
    expect(result[0].length).toBeLessThanOrEqual(106); // "Jan: " (5) + 100 chars + 1 for substring
  });

  it('zwraca pustą listę dla pustej tablicy', () => {
    expect(detectUnansweredQuestions([])).toEqual([]);
  });
});

// --- generateChannelSummary ---

describe('generateChannelSummary', () => {
  it('wywołuje LLM z poprawnymi danymi', async () => {
    const activity = {
      channelId: 'C1',
      channelName: 'general',
      messageCount: 42,
      activeThreads: 3,
      topUsers: [{ name: 'Jan', count: 10 }],
      messages: [{ user_name: 'Jan', text: 'Cześć' }],
    };
    const result = await generateChannelSummary(activity);
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'fast',
      maxTokens: 500,
    }));
    expect(result).toBe('Podsumowanie testowe.');
  });

  it('obsługuje aktywność z pustymi wiadomościami', async () => {
    const activity = {
      channelId: 'C1',
      channelName: 'empty',
      messageCount: 0,
      activeThreads: 0,
      topUsers: [],
      messages: [],
    };
    await generateChannelSummary(activity);
    expect(ask).toHaveBeenCalled();
  });
});

// --- runChannelDigest ---

describe('runChannelDigest', () => {
  const mockApp = {
    client: {
      conversations: {
        list: jest.fn(() => Promise.resolve({
          channels: [
            { id: 'C1', name: 'general' },
            { id: 'C2', name: 'team' },
          ],
        })),
        info: jest.fn(() => Promise.resolve({ channel: { name: 'general' } })),
      },
      chat: {
        postMessage: jest.fn(() => Promise.resolve()),
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset supabase mock do zwracania pustych danych
    supabase.from.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          gt: jest.fn(() => ({
            order: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    });
  });

  it('wysyła digest na Slack', async () => {
    await runChannelDigest(mockApp);
    expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C_DIGEST',
        text: expect.stringContaining('Channel Digest'),
      })
    );
  });

  it('pomija nieistniejące kanały', async () => {
    mockApp.client.conversations.list.mockResolvedValueOnce({
      channels: [{ id: 'C1', name: 'general' }], // brak 'team'
    });
    await runChannelDigest(mockApp);
    expect(mockApp.client.chat.postMessage).toHaveBeenCalled();
  });

  it('obsługuje błąd listowania kanałów', async () => {
    mockApp.client.conversations.list.mockRejectedValueOnce(new Error('API error'));
    await runChannelDigest(mockApp);
    expect(logError).toHaveBeenCalledWith('channel-digest', expect.stringContaining('listowania'), expect.any(String));
  });

  it('dodaje sekcję "brak aktywności" dla kanału bez wiadomości', async () => {
    await runChannelDigest(mockApp);
    expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('brak aktywności'),
      })
    );
  });
});

// --- runChannelDigest — brak konfiguracji ---

describe('runChannelDigest — brak konfiguracji', () => {
  it('wychodzi wcześnie gdy brak DIGEST_CHANNEL', async () => {
    const origChannel = process.env.CHANNEL_DIGEST_CHANNEL;
    process.env.CHANNEL_DIGEST_CHANNEL = '';

    // Re-import z nowymi env vars
    jest.resetModules();
    jest.mock('../src/services/supabase', () => ({ supabase: { from: jest.fn() } }));
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    jest.mock('../src/services/llm', () => ({ ask: jest.fn() }));
    const mod = require('../src/services/channelDigest');

    const mockApp = { client: { conversations: { list: jest.fn() }, chat: { postMessage: jest.fn() } } };
    await mod.runChannelDigest(mockApp);
    expect(mockApp.client.conversations.list).not.toHaveBeenCalled();

    process.env.CHANNEL_DIGEST_CHANNEL = origChannel;
  });
});
