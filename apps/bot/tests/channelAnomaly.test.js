// Testy detekcji anomalii kanałów
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
          single: jest.fn(() => Promise.resolve({ data: null })),
        })),
      })),
    })),
  },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

process.env.CHANNEL_ANOMALY_ENABLED = 'true';
process.env.CHANNEL_ANOMALY_CHANNEL = 'C_ALERTS';
process.env.CHANNEL_ANOMALY_CHANNELS = 'general,team';
process.env.CHANNEL_ANOMALY_SPIKE_MULTIPLIER = '3';

const { recordActivity, getAverageActivity, detectVolumeSpike, detectUnansweredClusters, checkChannelAnomalies, _getChannelWindows } = require('../src/services/channelAnomaly');
const { logError } = require('../src/services/errors');

beforeEach(() => {
  _getChannelWindows().clear();
  jest.clearAllMocks();
});

// --- recordActivity ---

describe('recordActivity', () => {
  it('zapisuje aktywność kanału', () => {
    recordActivity('C1', 5);
    expect(_getChannelWindows().get('C1')).toEqual([5]);
  });

  it('dodaje kolejne wpisy', () => {
    recordActivity('C1', 5);
    recordActivity('C1', 10);
    recordActivity('C1', 3);
    expect(_getChannelWindows().get('C1')).toEqual([5, 10, 3]);
  });

  it('ogranicza window do WINDOW_SIZE (336 bucketów)', () => {
    for (let i = 0; i < 400; i++) {
      recordActivity('C1', i);
    }
    const window = _getChannelWindows().get('C1');
    expect(window.length).toBe(336);
    // Powinien zawierać ostatnie 336 wartości (64-399)
    expect(window[0]).toBe(64);
  });
});

// --- getAverageActivity ---

describe('getAverageActivity', () => {
  it('zwraca 0 dla nieznanego kanału', () => {
    expect(getAverageActivity('unknown')).toBe(0);
  });

  it('oblicza średnią poprawnie', () => {
    recordActivity('C1', 10);
    recordActivity('C1', 20);
    recordActivity('C1', 30);
    expect(getAverageActivity('C1')).toBe(20);
  });

  it('obsługuje pojedynczy wpis', () => {
    recordActivity('C1', 42);
    expect(getAverageActivity('C1')).toBe(42);
  });
});

// --- detectVolumeSpike ---

describe('detectVolumeSpike', () => {
  it('wykrywa spike powyżej multiplier × average', () => {
    // Wypełnij historię ze średnią 5
    for (let i = 0; i < 10; i++) recordActivity('C1', 5);
    expect(detectVolumeSpike('C1', 16)).toBe(true); // 16 > 5 * 3
  });

  it('nie wykrywa spike poniżej progu', () => {
    for (let i = 0; i < 10; i++) recordActivity('C1', 5);
    expect(detectVolumeSpike('C1', 14)).toBe(false); // 14 < 5 * 3
  });

  it('nie wykrywa spike gdy średnia = 0', () => {
    expect(detectVolumeSpike('C_EMPTY', 100)).toBe(false);
  });

  it('nie wykrywa spike gdy wartość = 0', () => {
    for (let i = 0; i < 10; i++) recordActivity('C1', 5);
    expect(detectVolumeSpike('C1', 0)).toBe(false);
  });
});

// --- detectUnansweredClusters ---

describe('detectUnansweredClusters', () => {
  it('zwraca pustą listę gdy brak wiadomości', async () => {
    const mockApp = {};
    const result = await detectUnansweredClusters(mockApp, 'C1');
    expect(result).toEqual([]);
  });
});

// --- checkChannelAnomalies ---

describe('checkChannelAnomalies', () => {
  const mockApp = {
    client: {
      conversations: {
        list: jest.fn(() => Promise.resolve({
          channels: [
            { id: 'C1', name: 'general' },
            { id: 'C2', name: 'team' },
          ],
        })),
      },
      chat: {
        postMessage: jest.fn(() => Promise.resolve()),
      },
    },
  };

  it('nie wysyła alertów gdy brak anomalii', async () => {
    await checkChannelAnomalies(mockApp);
    expect(mockApp.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('obsługuje błąd listowania kanałów', async () => {
    mockApp.client.conversations.list.mockRejectedValueOnce(new Error('API error'));
    await checkChannelAnomalies(mockApp);
    expect(logError).toHaveBeenCalledWith('channel-anomaly', expect.stringContaining('listowania'), expect.any(String));
  });
});

// --- checkChannelAnomalies — brak konfiguracji ---

describe('checkChannelAnomalies — brak konfiguracji', () => {
  it('wychodzi wcześnie gdy brak ALERT_CHANNEL', async () => {
    const origChannel = process.env.CHANNEL_ANOMALY_CHANNEL;
    process.env.CHANNEL_ANOMALY_CHANNEL = '';

    jest.resetModules();
    jest.mock('../src/services/supabase', () => ({ supabase: { from: jest.fn() } }));
    jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
    const mod = require('../src/services/channelAnomaly');

    const mockApp = { client: { conversations: { list: jest.fn() }, chat: { postMessage: jest.fn() } } };
    await mod.checkChannelAnomalies(mockApp);
    expect(mockApp.client.conversations.list).not.toHaveBeenCalled();

    process.env.CHANNEL_ANOMALY_CHANNEL = origChannel;
  });
});
