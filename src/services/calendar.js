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

// Mapa polskich nazw dni tygodnia → getDay() (0=niedziela)
const DAY_NAMES_MAP = {
  'poniedziałek': 1, 'poniedzialek': 1,
  'wtorek': 2,
  'środa': 3, 'sroda': 3, 'środę': 3, 'srode': 3, 'środy': 3,
  'czwartek': 4,
  'piątek': 5, 'piatek': 5,
  'sobota': 6, 'sobotę': 6, 'sobote': 6, 'soboty': 6,
  'niedziela': 0, 'niedzielę': 0, 'niedziele': 0, 'niedzieli': 0,
};

// Date → 'YYYY-MM-DD' (local timezone, nie UTC)
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Poniedziałek danego tygodnia
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Najbliższy dzień tygodnia (od from włącznie)
function findNextDayOfWeek(from, targetDay) {
  const d = new Date(from);
  const current = d.getDay();
  let diff = targetDay - current;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Smart parser dat kalendarza — rozumie polskie wyrażenia czasowe
function parseCalendarDate(text) {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // "dziś" / "dzisiaj" / "dzis"
  if (/(^|\s)(dzi[sś]|dzisiaj)(\s|$|[?!.,])/.test(lower)) {
    const d = toDateStr(today);
    return { startDate: d, endDate: d };
  }

  // "pojutrze" (przed "jutro" żeby nie matchować "jutro" w "pojutrze")
  if (/\bpojutrze\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    const s = toDateStr(d);
    return { startDate: s, endDate: s };
  }

  // "jutro"
  if (/\bjutro\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    const s = toDateStr(d);
    return { startDate: s, endDate: s };
  }

  // "ten tydzień" / "tym tygodniu" / "tego tygodnia" / "bieżący tydzień"
  if (/\b(ten tydzień|tym tygodni|tego tygodni|bieżąc\w* tydzi)/i.test(lower)) {
    const mon = getMonday(today);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return { startDate: toDateStr(mon), endDate: toDateStr(sun) };
  }

  // "przyszły/następny tydzień" + opcjonalny dzień
  const nextWeekMatch = lower.match(/\b(przysz[łl]\w*|nast[eę]pn\w*)\s+(tydzie[nń]|tygodn\w+)/);
  if (nextWeekMatch) {
    const nextMon = getMonday(today);
    nextMon.setDate(nextMon.getDate() + 7);
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextSun.getDate() + 6);

    // Szukaj dnia tygodnia w tekście
    for (const [name, dayNum] of Object.entries(DAY_NAMES_MAP)) {
      if (lower.includes(name)) {
        const target = new Date(nextMon);
        let diff = dayNum - 1; // 1=poniedziałek offset od poniedziałku
        if (dayNum === 0) diff = 6; // niedziela = +6 od poniedziałku
        target.setDate(target.getDate() + diff);
        const s = toDateStr(target);
        return { startDate: s, endDate: s };
      }
    }

    return { startDate: toDateStr(nextMon), endDate: toDateStr(nextSun) };
  }

  // "przyszły/następny" + dzień tygodnia (bez "tydzień")
  const nextDayMatch = lower.match(/\b(przysz[łl]\w*|nast[eę]pn\w*)\s+/);
  if (nextDayMatch) {
    for (const [name, dayNum] of Object.entries(DAY_NAMES_MAP)) {
      if (lower.includes(name)) {
        const nextMon = getMonday(today);
        nextMon.setDate(nextMon.getDate() + 7);
        const target = new Date(nextMon);
        let diff = dayNum - 1;
        if (dayNum === 0) diff = 6;
        target.setDate(target.getDate() + diff);
        const s = toDateStr(target);
        return { startDate: s, endDate: s };
      }
    }
  }

  // Sam dzień tygodnia → najbliższy (od dziś)
  for (const [name, dayNum] of Object.entries(DAY_NAMES_MAP)) {
    if (lower.includes(name)) {
      const d = findNextDayOfWeek(today, dayNum);
      const s = toDateStr(d);
      return { startDate: s, endDate: s };
    }
  }

  // Brak dopasowania → null (fallback do workforce)
  return null;
}

// Reużyj buildDateRange z workforce.js, ale najpierw spróbuj parseCalendarDate
function buildCalendarDateRange(query) {
  const smart = parseCalendarDate(query);
  if (smart) return smart;

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
  const calNames = CALENDAR_IDS.map(id => id.split('@')[0]).join(', ');
  return `\n\nKONTEKST Z GOOGLE CALENDAR (kalendarze: ${calNames}):\nUWAGA: To są TYLKO kalendarze podpiętych osób. Jeśli pytanie dotyczy kogoś innego — te dane NIE dotyczą tej osoby.\n---\n${content}\n---\n`;
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
  parseCalendarDate,
  buildCalendarDateRange,
  buildContextFromCalendar,
  createCalendarEvent,
};
