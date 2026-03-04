// src/services/calendar.js — integracja z Google Calendar API (Service Account)

const { google } = require('googleapis');
const { logError } = require('./errors');

const CALENDAR_IDS = (process.env.GOOGLE_CALENDAR_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Warsaw';

// Dekoduj base64 env var → JSON credentials
function parseServiceAccountKey() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// Utwórz klienta Google Calendar API
function createCalendarClient() {
  const credentials = parseServiceAccountKey();
  if (!credentials) return null;

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

// Normalizuj event z API do prostego obiektu
function normalizeEvent(item) {
  return {
    title: item.summary || '(bez tytułu)',
    start: item.start?.dateTime || item.start?.date || '',
    end: item.end?.dateTime || item.end?.date || '',
    allDay: !item.start?.dateTime,
    attendees: (item.attendees || []).map(a => a.email),
    organizer: item.organizer?.email || '',
    status: item.status || '',
  };
}

// Pobierz wydarzenia z wszystkich kalendarzy w zakresie dat
async function getEvents(startDate, endDate) {
  const cal = createCalendarClient();
  if (!cal) return [];
  if (CALENDAR_IDS.length === 0) return [];

  const timeMin = new Date(`${startDate}T00:00:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59`).toISOString();

  const results = await Promise.all(
    CALENDAR_IDS.map(async (calendarId) => {
      try {
        const res = await cal.events.list({
          calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          timeZone: TIMEZONE,
          maxResults: 100,
        });
        return (res.data.items || []).map(normalizeEvent);
      } catch (error) {
        logError('calendar', `Błąd pobierania z ${calendarId}`, error.message);
        return [];
      }
    })
  );

  return results.flat();
}

// Formatuj czas eventu do czytelnej formy
function formatEventTime(start, end) {
  if (!start) return '';
  // Cały dzień
  if (!start.includes('T')) return 'cały dzień';

  const fmt = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
  };

  return `${fmt(start)}-${fmt(end)}`;
}

// Reużyj buildDateRange z workforce.js, ale ogranicz startDate do dziś
function buildCalendarDateRange(query) {
  const { buildDateRange } = require('./workforce');
  const range = buildDateRange(query);
  const today = new Date().toISOString().split('T')[0];
  if (range.startDate < today) range.startDate = today;
  return range;
}

// Zbuduj kontekst z wydarzeń dla Claude
function buildContextFromCalendar(events) {
  if (!events || events.length === 0) return 'Brak wydarzeń w podanym zakresie.';

  const byDay = {};
  for (const e of events) {
    const day = e.start.split('T')[0] || e.start;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  }

  const DAY_NAMES = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  const lines = [];
  for (const [day, dayEvents] of Object.entries(byDay).sort()) {
    const dayName = DAY_NAMES[new Date(day + 'T00:00:00').getDay()];
    lines.push(`  ${day} (${dayName}):`);
    for (const e of dayEvents) {
      const time = formatEventTime(e.start, e.end);
      const attendeesStr = e.attendees.length > 0
        ? ` [${e.attendees.map(a => a.split('@')[0]).join(', ')}]`
        : '';
      lines.push(`    - ${time} ${e.title}${attendeesStr}`);
    }
  }

  const content = lines.join('\n').substring(0, 3000);
  return `\n\nKONTEKST Z GOOGLE CALENDAR (spotkania i wydarzenia):\n---\n${content}\n---\n`;
}

// Utwórz nowe wydarzenie w kalendarzu
async function createCalendarEvent({ title, startDateTime, endDateTime, attendees, description }) {
  const cal = createCalendarClient();
  if (!cal) throw new Error('Google Calendar nie jest skonfigurowany.');

  const calendarId = CALENDAR_IDS[0];
  if (!calendarId) throw new Error('Brak skonfigurowanych kalendarzy.');

  const event = {
    summary: title,
    description: description || '',
    start: { dateTime: startDateTime, timeZone: TIMEZONE },
    end: { dateTime: endDateTime, timeZone: TIMEZONE },
  };

  if (attendees && attendees.length > 0) {
    event.attendees = attendees.map(email => ({ email }));
  }

  const res = await cal.events.insert({ calendarId, resource: event });
  return `Utworzono wydarzenie "${res.data.summary}" (${res.data.start.dateTime} → ${res.data.end.dateTime})`;
}

module.exports = {
  parseServiceAccountKey,
  createCalendarClient,
  getEvents,
  normalizeEvent,
  formatEventTime,
  buildCalendarDateRange,
  buildContextFromCalendar,
  createCalendarEvent,
};
