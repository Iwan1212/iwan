// Testy serwisu Google Calendar
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
jest.mock('../src/services/workforce', () => ({
  buildDateRange: jest.fn().mockReturnValue({ startDate: '2026-03-01', endDate: '2026-03-31' }),
}));

// Mock googleapis przed importem
const mockEventsList = jest.fn();
const mockEventsInsert = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(() => ({})),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        list: mockEventsList,
        insert: mockEventsInsert,
      },
    }),
  },
}));

// Ustaw env vars PRZED importem modułu (CALENDAR_IDS czytane przy ładowaniu)
const FAKE_KEY = Buffer.from(JSON.stringify({
  client_email: 'bot@test.iam.gserviceaccount.com',
  private_key: 'fake-key',
})).toString('base64');

process.env.GOOGLE_SERVICE_ACCOUNT_KEY = FAKE_KEY;
process.env.GOOGLE_CALENDAR_IDS = 'team@group.calendar.google.com,dev@group.calendar.google.com';
process.env.GOOGLE_CALENDAR_TIMEZONE = 'Europe/Warsaw';

const {
  parseServiceAccountKey,
  normalizeEvent,
  formatEventTime,
  getEvents,
  buildCalendarDateRange,
  buildContextFromCalendar,
  createCalendarEvent,
} = require('../src/services/calendar');

describe('parseServiceAccountKey', () => {
  it('dekoduje base64 env var do JSON', () => {
    const key = parseServiceAccountKey();
    expect(key).toHaveProperty('client_email', 'bot@test.iam.gserviceaccount.com');
    expect(key).toHaveProperty('private_key', 'fake-key');
  });

  it('zwraca null dla pustego klucza', () => {
    const orig = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = '';
    // Musimy przeimportować moduł, ale parseServiceAccountKey czyta env w runtime
    // więc wystarczy zmienić env
    const result = parseServiceAccountKey();
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY = orig;
    // Pusty string → null
    expect(result).toBeNull();
  });
});

describe('normalizeEvent', () => {
  it('normalizuje event z dateTime', () => {
    const item = {
      summary: 'Standup',
      start: { dateTime: '2026-03-05T09:00:00+01:00' },
      end: { dateTime: '2026-03-05T09:30:00+01:00' },
      attendees: [{ email: 'jan@test.com' }, { email: 'anna@test.com' }],
      organizer: { email: 'jan@test.com' },
      status: 'confirmed',
    };

    const result = normalizeEvent(item);
    expect(result.title).toBe('Standup');
    expect(result.allDay).toBe(false);
    expect(result.attendees).toEqual(['jan@test.com', 'anna@test.com']);
    expect(result.organizer).toBe('jan@test.com');
  });

  it('normalizuje event całodniowy', () => {
    const item = {
      summary: 'Hackathon',
      start: { date: '2026-03-10' },
      end: { date: '2026-03-11' },
    };

    const result = normalizeEvent(item);
    expect(result.allDay).toBe(true);
    expect(result.start).toBe('2026-03-10');
  });

  it('obsługuje brak tytułu', () => {
    const result = normalizeEvent({ start: {}, end: {} });
    expect(result.title).toBe('(bez tytułu)');
  });
});

describe('formatEventTime', () => {
  it('zwraca "cały dzień" dla dat bez czasu', () => {
    expect(formatEventTime('2026-03-05', '2026-03-06')).toBe('cały dzień');
  });

  it('formatuje zakres godzin', () => {
    const result = formatEventTime(
      '2026-03-05T09:00:00+01:00',
      '2026-03-05T10:30:00+01:00',
    );
    expect(result).toMatch(/09:00.*10:30/);
  });

  it('zwraca pusty string dla braku danych', () => {
    expect(formatEventTime('', '')).toBe('');
  });
});

describe('getEvents', () => {
  beforeEach(() => mockEventsList.mockReset());

  it('pobiera wydarzenia z obu kalendarzy równolegle', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          { summary: 'Meeting', start: { dateTime: '2026-03-05T10:00:00+01:00' }, end: { dateTime: '2026-03-05T11:00:00+01:00' } },
        ],
      },
    });

    const events = await getEvents('2026-03-01', '2026-03-31');
    // 2 kalendarze × 1 event = 2 wydarzenia
    expect(events).toHaveLength(2);
    expect(mockEventsList).toHaveBeenCalledTimes(2);
  });

  it('obsługuje błąd jednego kalendarza', async () => {
    mockEventsList
      .mockResolvedValueOnce({ data: { items: [{ summary: 'OK', start: {}, end: {} }] } })
      .mockRejectedValueOnce(new Error('403'));

    const events = await getEvents('2026-03-01', '2026-03-31');
    expect(events).toHaveLength(1);
  });
});

describe('buildCalendarDateRange', () => {
  it('deleguje do buildDateRange z workforce i ogranicza startDate do dziś', () => {
    const { buildDateRange } = require('../src/services/workforce');
    const result = buildCalendarDateRange('spotkania w marcu');
    expect(buildDateRange).toHaveBeenCalledWith('spotkania w marcu');
    const today = new Date().toISOString().split('T')[0];
    expect(result.startDate).toBe(today);
    expect(result.endDate).toBe('2026-03-31');
  });
});

describe('buildContextFromCalendar', () => {
  it('zwraca info o braku wydarzeń', () => {
    expect(buildContextFromCalendar([])).toBe('Brak wydarzeń w podanym zakresie.');
  });

  it('grupuje wydarzenia po dniach', () => {
    const events = [
      { title: 'Standup', start: '2026-03-05T09:00:00+01:00', end: '2026-03-05T09:30:00+01:00', allDay: false, attendees: ['jan@test.com'], organizer: '', status: '' },
      { title: 'Review', start: '2026-03-05T14:00:00+01:00', end: '2026-03-05T15:00:00+01:00', allDay: false, attendees: [], organizer: '', status: '' },
      { title: 'Planning', start: '2026-03-06T10:00:00+01:00', end: '2026-03-06T11:00:00+01:00', allDay: false, attendees: ['anna@test.com', 'jan@test.com'], organizer: '', status: '' },
    ];

    const result = buildContextFromCalendar(events);
    expect(result).toContain('KONTEKST Z GOOGLE CALENDAR');
    expect(result).toContain('2026-03-05');
    expect(result).toContain('Standup');
    expect(result).toContain('Review');
    expect(result).toContain('2026-03-06');
    expect(result).toContain('Planning');
    expect(result).toContain('[jan]');
    expect(result).toContain('[anna, jan]');
  });
});

describe('createCalendarEvent', () => {
  beforeEach(() => mockEventsInsert.mockReset());

  it('tworzy wydarzenie i zwraca potwierdzenie', async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        summary: 'Sprint Planning',
        start: { dateTime: '2026-03-07T10:00:00+01:00' },
        end: { dateTime: '2026-03-07T11:00:00+01:00' },
      },
    });

    const result = await createCalendarEvent({
      title: 'Sprint Planning',
      startDateTime: '2026-03-07T10:00:00+01:00',
      endDateTime: '2026-03-07T11:00:00+01:00',
      attendees: ['jan@test.com'],
      description: 'Planowanie sprintu',
    });

    expect(result).toContain('Sprint Planning');
    expect(mockEventsInsert).toHaveBeenCalledTimes(1);

    const callArgs = mockEventsInsert.mock.calls[0][0];
    expect(callArgs.resource.summary).toBe('Sprint Planning');
    expect(callArgs.resource.attendees).toEqual([{ email: 'jan@test.com' }]);
  });
});
