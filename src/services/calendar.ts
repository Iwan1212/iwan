// src/services/calendar.ts — integracja z Google Calendar API (Service Account)

import { google } from 'googleapis';
import { logError } from './errors.js';
import { withCache, CACHE_TTL } from './cache.js';
import type { CalendarEvent, DateRange } from '../types/index.js';

const CALENDAR_IDS = (process.env.GOOGLE_CALENDAR_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Europe/Warsaw';

// Dekoduj base64 env var → JSON credentials
export function parseServiceAccountKey(): Record<string, string> | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// Utwórz klienta Google Calendar API
export function createCalendarClient() {
  const credentials = parseServiceAccountKey();
  if (!credentials) return null;

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalendarItem = any;

// Normalizuj event z API do prostego obiektu
export function normalizeEvent(item: CalendarItem): CalendarEvent {
  return {
    title: item.summary || '(bez tytułu)',
    start: item.start?.dateTime || item.start?.date || '',
    end: item.end?.dateTime || item.end?.date || '',
    allDay: !item.start?.dateTime,
    attendees: (item.attendees || []).map((a: { email: string }) => a.email),
    organizer: item.organizer?.email || '',
    status: item.status || '',
  };
}

// Pobierz wydarzenia z wszystkich kalendarzy w zakresie dat
export async function getEvents(startDate: string, endDate: string): Promise<CalendarEvent[]> {
  const cal = createCalendarClient();
  if (!cal) return [];
  if (CALENDAR_IDS.length === 0) return [];

  return withCache(`calendar:events:${startDate}:${endDate}`, CACHE_TTL.CALENDAR_EVENTS, async () => {
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
          logError('calendar', `Błąd pobierania z ${calendarId}`, (error as Error).message);
          return [];
        }
      })
    );

    return results.flat();
  });
}

// Formatuj czas eventu do czytelnej formy
export function formatEventTime(start: string, end: string): string {
  if (!start) return '';
  if (!start.includes('T')) return 'cały dzień';

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
  };

  return `${fmt(start)}-${fmt(end)}`;
}

// Polskie nazwy miesięcy → numer (do parsowania "w marcu", "w Q2")
const MONTH_NAMES_MAP: Record<string, number> = {
  'styczeń': 1, 'styczniu': 1, 'styczen': 1, 'stycznia': 1,
  'luty': 2, 'lutym': 2, 'lutego': 2,
  'marzec': 3, 'marcu': 3, 'marca': 3,
  'kwiecień': 4, 'kwietniu': 4, 'kwiecien': 4, 'kwietnia': 4,
  'maj': 5, 'maju': 5, 'maja': 5,
  'czerwiec': 6, 'czerwcu': 6, 'czerwca': 6,
  'lipiec': 7, 'lipcu': 7, 'lipca': 7,
  'sierpień': 8, 'sierpniu': 8, 'sierpien': 8, 'sierpnia': 8,
  'wrzesień': 9, 'wrześniu': 9, 'wrzesien': 9, 'września': 9,
  'październik': 10, 'październiku': 10, 'pazdziernik': 10, 'października': 10,
  'listopad': 11, 'listopadzie': 11, 'listopada': 11,
  'grudzień': 12, 'grudniu': 12, 'grudzien': 12, 'grudnia': 12,
};

// Mapa polskich nazw dni tygodnia → getDay() (0=niedziela)
const DAY_NAMES_MAP: Record<string, number> = {
  'poniedziałek': 1, 'poniedzialek': 1,
  'wtorek': 2,
  'środa': 3, 'sroda': 3, 'środę': 3, 'srode': 3, 'środy': 3,
  'czwartek': 4,
  'piątek': 5, 'piatek': 5,
  'sobota': 6, 'sobotę': 6, 'sobote': 6, 'soboty': 6,
  'niedziela': 0, 'niedzielę': 0, 'niedziele': 0, 'niedzieli': 0,
};

// Date → 'YYYY-MM-DD' (local timezone, nie UTC)
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Poniedziałek danego tygodnia
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Najbliższy dzień tygodnia (od from włącznie)
function findNextDayOfWeek(from: Date, targetDay: number): Date {
  const d = new Date(from);
  const current = d.getDay();
  let diff = targetDay - current;
  if (diff < 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

// Smart parser dat kalendarza — rozumie polskie wyrażenia czasowe
export function parseCalendarDate(text: string): DateRange {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/(^|\s)(dzi[sś]|dzisiaj)(\s|$|[?!.,])/.test(lower)) {
    const d = toDateStr(today);
    return { startDate: d, endDate: d };
  }

  if (/\bpojutrze\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    const s = toDateStr(d);
    return { startDate: s, endDate: s };
  }

  if (/\bjutro\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    const s = toDateStr(d);
    return { startDate: s, endDate: s };
  }

  if (/\b(ten tydzień|tym tygodni|tego tygodni|bieżąc\w* tydzi)/i.test(lower)) {
    const mon = getMonday(today);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return { startDate: toDateStr(mon), endDate: toDateStr(sun) };
  }

  const nextWeekMatch = lower.match(/\b(przysz[łl]\S*|nast[eę]pn\S*)\s+(tydzie[nń]|tygodn\S+)/);
  if (nextWeekMatch) {
    const nextMon = getMonday(today);
    nextMon.setDate(nextMon.getDate() + 7);
    const nextSun = new Date(nextMon);
    nextSun.setDate(nextSun.getDate() + 6);

    for (const [name, dayNum] of Object.entries(DAY_NAMES_MAP)) {
      if (lower.includes(name)) {
        const target = new Date(nextMon);
        let diff = dayNum - 1;
        if (dayNum === 0) diff = 6;
        target.setDate(target.getDate() + diff);
        const s = toDateStr(target);
        return { startDate: s, endDate: s };
      }
    }

    return { startDate: toDateStr(nextMon), endDate: toDateStr(nextSun) };
  }

  const nextDayMatch = lower.match(/\b(przysz[łl]\S*|nast[eę]pn\S*)\s+/);
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

  for (const [name, dayNum] of Object.entries(DAY_NAMES_MAP)) {
    if (lower.includes(name)) {
      const d = findNextDayOfWeek(today, dayNum);
      const s = toDateStr(d);
      return { startDate: s, endDate: s };
    }
  }

  const qMatch = lower.match(/q(\d)/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const year = today.getFullYear();
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    const todayStr = toDateStr(today);
    return { startDate: startDate < todayStr ? todayStr : startDate, endDate };
  }

  for (const [name, monthNum] of Object.entries(MONTH_NAMES_MAP)) {
    if (lower.includes(name)) {
      const year = today.getFullYear();
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${lastDay}`;
      const todayStr = toDateStr(today);
      return { startDate: startDate < todayStr ? todayStr : startDate, endDate };
    }
  }

  const end = new Date(today);
  end.setDate(end.getDate() + 21);
  return { startDate: toDateStr(today), endDate: toDateStr(end) };
}

// Zbuduj zakres dat dla kalendarza — standalone, bez zależności od workforce
export function buildCalendarDateRange(query: string): DateRange {
  return parseCalendarDate(query);
}

// Zbuduj kontekst z wydarzeń dla Claude
export function buildContextFromCalendar(events: CalendarEvent[]): string {
  if (!events || events.length === 0) return 'Brak wydarzeń w podanym zakresie.';

  const byDay: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    const day = e.start.split('T')[0] || e.start;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(e);
  }

  const DAY_NAMES = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

  const lines: string[] = [];
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

  const content = lines.join('\n').substring(0, 6000);
  const calNames = CALENDAR_IDS.map(id => id.split('@')[0]).join(', ');
  return `\n\nKONTEKST Z GOOGLE CALENDAR (kalendarze: ${calNames}):\nUWAGA: To są TYLKO kalendarze podpiętych osób. Jeśli pytanie dotyczy kogoś innego — te dane NIE dotyczą tej osoby.\nUWAGA: Tytuły wydarzeń mogą nie pasować dosłownie do pytania użytkownika. Szukaj dopasowań semantycznych — np. "[Strategia] - Leadership status i K Framework" JEST spotkaniem leadershipowym o K Framework. Prefiksy w nawiasach (np. [Strategia], [Weekly]) to kategorie, nie pełne tytuły. Przeanalizuj KAŻDY event pod kątem pytania.\n---\n${content}\n---\n`;
}

// Utwórz nowe wydarzenie w kalendarzu
export async function createCalendarEvent({ title, startDateTime, endDateTime, attendees, description }: {
  title: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: string[];
  description?: string;
}): Promise<string> {
  const cal = createCalendarClient();
  if (!cal) throw new Error('Google Calendar nie jest skonfigurowany.');

  const calendarId = CALENDAR_IDS[0];
  if (!calendarId) throw new Error('Brak skonfigurowanych kalendarzy.');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event: any = {
    summary: title,
    description: description || '',
    start: { dateTime: startDateTime, timeZone: TIMEZONE },
    end: { dateTime: endDateTime, timeZone: TIMEZONE },
  };

  if (attendees && attendees.length > 0) {
    event.attendees = attendees.map(email => ({ email }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (cal.events.insert as any)({ calendarId, resource: event });
  return `Utworzono wydarzenie "${res.data.summary}" (${res.data.start?.dateTime} → ${res.data.end?.dateTime})`;
}
