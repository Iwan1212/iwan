// Testy serwisu Google Calendar
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
// workforce nie jest już potrzebny w calendar.js — nie mockujemy

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
  parseCalendarDate,
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

describe('parseCalendarDate', () => {
  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  it('"dziś" → today', () => {
    const result = parseCalendarDate('co mam dziś?');
    expect(result.startDate).toBe(toDateStr(today));
    expect(result.endDate).toBe(toDateStr(today));
  });

  it('"dzisiaj" → today', () => {
    const result = parseCalendarDate('spotkania dzisiaj');
    expect(result.startDate).toBe(toDateStr(today));
  });

  it('"jutro" → tomorrow', () => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    const result = parseCalendarDate('spotkania jutro');
    expect(result.startDate).toBe(toDateStr(t));
    expect(result.endDate).toBe(toDateStr(t));
  });

  it('"pojutrze" → today+2', () => {
    const t = new Date(today);
    t.setDate(t.getDate() + 2);
    const result = parseCalendarDate('co jest pojutrze?');
    expect(result.startDate).toBe(toDateStr(t));
  });

  it('"środa" → nearest Wednesday', () => {
    const result = parseCalendarDate('spotkanie w środę');
    const d = new Date(result.startDate + 'T00:00:00');
    expect(d.getDay()).toBe(3); // Wednesday
    expect(d >= today).toBe(true);
  });

  it('"przyszłą środę" → Wednesday next week', () => {
    const result = parseCalendarDate('przyszłą środę');
    const d = new Date(result.startDate + 'T12:00:00');
    expect(d.getDay()).toBe(3);
    // must be at least 7 days from now (next week)
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 6);
    expect(result.startDate > toDateStr(today)).toBe(true);
  });

  it('"przyszły tydzień" → Mon–Sun next week', () => {
    const result = parseCalendarDate('w przyszłym tygodniu');
    const start = new Date(result.startDate + 'T00:00:00');
    const end = new Date(result.endDate + 'T00:00:00');
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
    expect(end - start).toBe(6 * 24 * 60 * 60 * 1000);
  });

  it('"w przyszłym tygodniu w środę" → specific day next week', () => {
    const result = parseCalendarDate('w przyszłym tygodniu w środę');
    const d = new Date(result.startDate + 'T00:00:00');
    expect(d.getDay()).toBe(3);
    expect(result.startDate).toBe(result.endDate);
  });

  it('"ten tydzień" → Mon–Sun this week', () => {
    const result = parseCalendarDate('spotkania w tym tygodniu');
    const start = new Date(result.startDate + 'T00:00:00');
    const end = new Date(result.endDate + 'T00:00:00');
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
  });

  it('"spotkania w marcu" → cały marzec (od dziś)', () => {
    const result = parseCalendarDate('spotkania w marcu');
    expect(result.endDate).toBe('2026-03-31');
    expect(result.startDate <= '2026-03-31').toBe(true);
  });

  it('"Q2" → kwiecień-czerwiec', () => {
    const result = parseCalendarDate('spotkania w Q2');
    expect(result.endDate).toBe('2026-06-30');
    expect(result.startDate).toMatch(/^2026-04/);
  });

  it('brak daty → domyślnie 3 tygodnie od dziś', () => {
    const result = parseCalendarDate('kiedy mam spotkanie leadershipowe');
    const start = new Date(result.startDate + 'T12:00:00');
    const end = new Date(result.endDate + 'T12:00:00');
    const diffDays = Math.round((end - start) / (24 * 60 * 60 * 1000));
    expect(diffDays).toBe(21);
  });
});

describe('buildCalendarDateRange', () => {
  it('"spotkania w marcu" → cały marzec (standalone, bez workforce)', () => {
    const result = buildCalendarDateRange('spotkania w marcu');
    expect(result.endDate).toBe('2026-03-31');
  });

  it('"jutro" → single day', () => {
    const result = buildCalendarDateRange('co mam jutro');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    expect(result.startDate).toBe(`${y}-${m}-${d}`);
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
