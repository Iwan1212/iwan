// Testy detekcji anomalii workforce
jest.mock('../src/services/workforce', () => ({
  getTimeline: jest.fn(() => Promise.resolve({ employees: [] })),
  getUtilPercent: jest.fn((val) => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object') return val.percentage || 0;
    return 0;
  }),
}));
jest.mock('../src/services/cache', () => ({
  getCache: jest.fn(() => Promise.resolve(null)),
  setCache: jest.fn(() => Promise.resolve()),
  CACHE_TTL: { WORKFORCE_ANOMALY_SNAPSHOT: 90000 },
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

process.env.WP_ALERT_CHANNEL = 'C_ALERTS';
process.env.WP_API_URL = 'https://wp.test';

const { buildSnapshot, detectAnomalies, checkWorkforceAnomalies } = require('../src/services/workforceAnomaly');
const { getTimeline } = require('../src/services/workforce');
const { getCache, setCache } = require('../src/services/cache');
const { logError } = require('../src/services/errors');

beforeEach(() => {
  jest.clearAllMocks();
});

// --- buildSnapshot ---

describe('buildSnapshot', () => {
  it('buduje snapshot z tablicy pracowników', () => {
    const data = [
      { id: '1', name: 'Jan', team: 'Frontend', utilization: { '2026-03': 80 } },
      { id: '2', name: 'Anna', team: 'Backend', utilization: { '2026-03': 0 } },
    ];
    const snapshot = buildSnapshot(data);
    expect(snapshot.employees).toHaveLength(2);
    expect(snapshot.employees[0]).toMatchObject({ id: '1', name: 'Jan', totalAllocation: 80, onBench: false, overbooked: false });
    expect(snapshot.employees[1]).toMatchObject({ id: '2', name: 'Anna', totalAllocation: 0, onBench: true, overbooked: false });
    expect(snapshot.timestamp).toBeTruthy();
  });

  it('obsługuje obiekt z polem employees', () => {
    const data = { employees: [{ id: '1', name: 'Jan', team: 'Dev', utilization: { '2026-03': 120 } }] };
    const snapshot = buildSnapshot(data);
    expect(snapshot.employees[0].overbooked).toBe(true);
  });

  it('wykrywa overbooking (>100%)', () => {
    const data = [{ id: '1', name: 'Piotr', team: 'Dev', utilization: { '2026-03': 150 } }];
    const snapshot = buildSnapshot(data);
    expect(snapshot.employees[0].overbooked).toBe(true);
    expect(snapshot.employees[0].totalAllocation).toBe(150);
  });

  it('obsługuje puste dane', () => {
    const snapshot = buildSnapshot({});
    expect(snapshot.employees).toEqual([]);
  });

  it('buduje imię z first_name i last_name', () => {
    const data = [{ id: '1', first_name: 'Jan', last_name: 'Kowalski', team: 'Dev', utilization: {} }];
    const snapshot = buildSnapshot(data);
    expect(snapshot.employees[0].name).toBe('Jan Kowalski');
  });
});

// --- detectAnomalies ---

describe('detectAnomalies', () => {
  it('wykrywa nowy overbooking', () => {
    const previous = { timestamp: '', employees: [{ id: '1', name: 'Jan', team: 'Dev', totalAllocation: 90, onBench: false, overbooked: false }] };
    const current = { timestamp: '', employees: [{ id: '1', name: 'Jan', team: 'Dev', totalAllocation: 120, onBench: false, overbooked: true }] };
    const anomalies = detectAnomalies(current, previous);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('new_overbooking');
  });

  it('wykrywa nowy bench', () => {
    const previous = { timestamp: '', employees: [{ id: '1', name: 'Anna', team: 'QA', totalAllocation: 50, onBench: false, overbooked: false }] };
    const current = { timestamp: '', employees: [{ id: '1', name: 'Anna', team: 'QA', totalAllocation: 0, onBench: true, overbooked: false }] };
    const anomalies = detectAnomalies(current, previous);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('new_bench');
  });

  it('wykrywa spadek alokacji', () => {
    const previous = { timestamp: '', employees: [{ id: '1', name: 'Piotr', team: 'Dev', totalAllocation: 100, onBench: false, overbooked: false }] };
    const current = { timestamp: '', employees: [{ id: '1', name: 'Piotr', team: 'Dev', totalAllocation: 60, onBench: false, overbooked: false }] };
    const anomalies = detectAnomalies(current, previous);
    const dropAlert = anomalies.find(a => a.type === 'alloc_drop');
    expect(dropAlert).toBeTruthy();
    expect(dropAlert.detail).toContain('spadek');
  });

  it('wykrywa skok alokacji', () => {
    const previous = { timestamp: '', employees: [{ id: '1', name: 'Marta', team: 'Dev', totalAllocation: 50, onBench: false, overbooked: false }] };
    const current = { timestamp: '', employees: [{ id: '1', name: 'Marta', team: 'Dev', totalAllocation: 100, onBench: false, overbooked: false }] };
    const anomalies = detectAnomalies(current, previous);
    const spikeAlert = anomalies.find(a => a.type === 'alloc_spike');
    expect(spikeAlert).toBeTruthy();
    expect(spikeAlert.detail).toContain('wzrost');
  });

  it('nie generuje alertu gdy brak zmian', () => {
    const employees = [{ id: '1', name: 'Jan', team: 'Dev', totalAllocation: 80, onBench: false, overbooked: false }];
    const anomalies = detectAnomalies({ timestamp: '', employees }, { timestamp: '', employees });
    expect(anomalies).toHaveLength(0);
  });

  it('ignoruje nowych pracowników (brak w previous)', () => {
    const previous = { timestamp: '', employees: [] };
    const current = { timestamp: '', employees: [{ id: '99', name: 'Nowy', team: 'Dev', totalAllocation: 100, onBench: false, overbooked: false }] };
    const anomalies = detectAnomalies(current, previous);
    expect(anomalies).toHaveLength(0);
  });
});

// --- checkWorkforceAnomalies ---

describe('checkWorkforceAnomalies', () => {
  const mockApp = {
    client: {
      chat: {
        postMessage: jest.fn(() => Promise.resolve()),
      },
    },
  };

  it('zapisuje snapshot przy pierwszym uruchomieniu', async () => {
    getTimeline.mockResolvedValue({ employees: [{ id: '1', name: 'Jan', team: 'Dev', utilization: { '2026-03': 80 } }] });
    getCache.mockResolvedValue(null);

    await checkWorkforceAnomalies(mockApp);

    expect(setCache).toHaveBeenCalledWith('workforce:anomaly:prev_snapshot', expect.any(Object), 90000);
    expect(mockApp.client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('wysyła alerty gdy wykryto anomalie', async () => {
    getTimeline.mockResolvedValue({ employees: [{ id: '1', name: 'Jan', team: 'Dev', utilization: { '2026-03': 120 } }] });
    getCache.mockResolvedValue({
      timestamp: '2026-03-17',
      employees: [{ id: '1', name: 'Jan', team: 'Dev', totalAllocation: 80, onBench: false, overbooked: false }],
    });

    await checkWorkforceAnomalies(mockApp);

    expect(mockApp.client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C_ALERTS',
        text: expect.stringContaining('Anomaly Alert'),
      })
    );
  });

  it('nie wysyła alertów gdy brak anomalii', async () => {
    getTimeline.mockResolvedValue({ employees: [{ id: '1', name: 'Jan', team: 'Dev', utilization: { '2026-03': 80 } }] });
    getCache.mockResolvedValue({
      timestamp: '2026-03-17',
      employees: [{ id: '1', name: 'Jan', team: 'Dev', totalAllocation: 80, onBench: false, overbooked: false }],
    });

    await checkWorkforceAnomalies(mockApp);
    expect(mockApp.client.chat.postMessage).not.toHaveBeenCalled();
  });
});
