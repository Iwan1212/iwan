// Testy scentralizowanego schedulera cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const cron = require('node-cron');
const { registerJob, listJobs, stopAll, _getJobs } = require('../src/services/scheduler');

beforeEach(() => {
  // Wyczyść joby między testami
  _getJobs().clear();
  jest.clearAllMocks();
});

// --- registerJob ---

describe('registerJob', () => {
  it('rejestruje nowy job z poprawnym cron expression', () => {
    registerJob('test-job', '*/5 * * * *', () => {});
    expect(cron.schedule).toHaveBeenCalledWith(
      '*/5 * * * *',
      expect.any(Function),
      { timezone: 'Europe/Warsaw' }
    );
    expect(_getJobs().has('test-job')).toBe(true);
  });

  it('ustawia lastRun na null przy rejestracji', () => {
    registerJob('test-job', '0 8 * * *', () => {});
    const job = _getJobs().get('test-job');
    expect(job.lastRun).toBeNull();
    expect(job.lastDurationMs).toBeNull();
  });

  it('nie nadpisuje istniejącego joba o tej samej nazwie', () => {
    registerJob('dup-job', '0 8 * * *', () => {});
    registerJob('dup-job', '0 9 * * *', () => {});
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const job = _getJobs().get('dup-job');
    expect(job.expression).toBe('0 8 * * *');
  });

  it('rejestruje wielu jobów niezależnie', () => {
    registerJob('job-a', '0 8 * * *', () => {});
    registerJob('job-b', '0 9 * * *', () => {});
    registerJob('job-c', '*/30 * * * *', () => {});
    expect(_getJobs().size).toBe(3);
  });
});

// --- listJobs ---

describe('listJobs', () => {
  it('zwraca pustą listę gdy brak jobów', () => {
    expect(listJobs()).toEqual([]);
  });

  it('zwraca listę zarejestrowanych jobów', () => {
    registerJob('job-1', '0 8 * * *', () => {});
    registerJob('job-2', '*/5 * * * *', () => {});
    const list = listJobs();
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ name: 'job-1', expression: '0 8 * * *', lastRun: null, lastDurationMs: null });
    expect(list[1]).toEqual({ name: 'job-2', expression: '*/5 * * * *', lastRun: null, lastDurationMs: null });
  });

  it('nie ujawnia wewnętrznych pól (task, handler)', () => {
    registerJob('job-x', '0 8 * * *', () => {});
    const list = listJobs();
    expect(list[0]).not.toHaveProperty('task');
    expect(list[0]).not.toHaveProperty('handler');
  });
});

// --- stopAll ---

describe('stopAll', () => {
  it('zatrzymuje wszystkie joby i czyści mapę', () => {
    registerJob('job-a', '0 8 * * *', () => {});
    registerJob('job-b', '0 9 * * *', () => {});
    const jobA = _getJobs().get('job-a');
    const jobB = _getJobs().get('job-b');
    stopAll();
    expect(jobA.task.stop).toHaveBeenCalled();
    expect(jobB.task.stop).toHaveBeenCalled();
    expect(_getJobs().size).toBe(0);
  });

  it('nie rzuca błędu na pustej mapie', () => {
    expect(() => stopAll()).not.toThrow();
  });
});

// --- cron handler execution ---

describe('cron handler execution', () => {
  it('aktualizuje lastRun i lastDurationMs po pomyślnym uruchomieniu', async () => {
    const handler = jest.fn(() => Promise.resolve());
    registerJob('run-job', '0 8 * * *', handler);

    // Wywołaj zarejestrowany handler
    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();

    const job = _getJobs().get('run-job');
    expect(job.lastRun).toBeInstanceOf(Date);
    expect(typeof job.lastDurationMs).toBe('number');
    expect(handler).toHaveBeenCalled();
  });

  it('loguje błąd gdy handler rzuca wyjątek', async () => {
    const { logError } = require('../src/services/errors');
    const handler = jest.fn(() => Promise.reject(new Error('boom')));
    registerJob('fail-job', '0 8 * * *', handler);

    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();

    expect(logError).toHaveBeenCalledWith('scheduler', "Job 'fail-job' failed", 'boom');
  });
});
