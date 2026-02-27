// src/services/workforce.js — integracja z Workforce Planner API
const { logError } = require('./errors');

const WP_API_URL = (process.env.WP_API_URL || '').replace(/\/$/, '');
const WP_EMAIL = process.env.WP_EMAIL || '';
const WP_PASSWORD = process.env.WP_PASSWORD || '';

// Tokeny JWT w pamięci (restart = re-login)
let accessToken = null;
let refreshToken = null;

// Polskie nazwy miesięcy do parsowania dat z pytań
const MONTH_NAMES = {
  'styczeń': 1, 'styczniu': 1, 'styczen': 1, 'sty': 1,
  'luty': 2, 'lutym': 2, 'lut': 2,
  'marzec': 3, 'marcu': 3, 'mar': 3,
  'kwiecień': 4, 'kwietniu': 4, 'kwiecien': 4, 'kwi': 4,
  'maj': 5, 'maju': 5,
  'czerwiec': 6, 'czerwcu': 6, 'cze': 6,
  'lipiec': 7, 'lipcu': 7, 'lip': 7,
  'sierpień': 8, 'sierpniu': 8, 'sierpien': 8, 'sie': 8,
  'wrzesień': 9, 'wrześniu': 9, 'wrzesien': 9, 'wrz': 9,
  'październik': 10, 'październiku': 10, 'pazdziernik': 10, 'paź': 10, 'paz': 10,
  'listopad': 11, 'listopadzie': 11, 'lis': 11,
  'grudzień': 12, 'grudniu': 12, 'grudzien': 12, 'gru': 12,
};

// Frazy wskazujące na pytanie o workforce
const WP_PHRASES = [
  'kto jest wolny', 'kto wolny', 'kto jest dostępny', 'kto dostępny',
  'nad czym pracuje', 'jaka utylizacja', 'ile osób wolnych',
  'kto jest overbookowany', 'kto jest przeciążony',
  'jaki jest skład', 'kto pracuje nad', 'kto jest przypisany',
  'ile osób pracuje', 'kto jest na benchu', 'bench',
];

// Słowa kluczowe dotyczące workforce
const WP_KEYWORDS = new Set([
  'wolny', 'wolna', 'wolne', 'wolni', 'dostępny', 'dostępna', 'dostepny',
  'alokacja', 'alokacje', 'overbooking', 'overbookowany', 'przeciążony', 'przeciazony',
  'bench', 'utylizacja', 'utilization', 'zespół', 'zespol', 'team',
  'przypisany', 'przypisana', 'przypisanie', 'projekt', 'projekty',
  'frontend', 'backend', 'devops', 'mobile', 'design', 'pm',
]);

// Sprawdź czy pytanie dotyczy workforce (2+ keywords LUB dopasowanie frazy)
function shouldQueryWorkforce(text) {
  if (!WP_API_URL) return false;
  const lower = text.toLowerCase();

  // Dopasowanie frazy
  for (const phrase of WP_PHRASES) {
    if (lower.includes(phrase)) return true;
  }

  // Dopasowanie 2+ keywords
  const words = lower.replace(/[?!.,;:()]/g, '').split(/\s+/);
  let count = 0;
  for (const w of words) {
    if (WP_KEYWORDS.has(w)) count++;
    if (count >= 2) return true;
  }

  return false;
}

// Sprawdź czy token JWT jest wygasły (z 60s marginesem)
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return Date.now() >= (payload.exp * 1000) - 60000;
  } catch {
    return true;
  }
}

// Zaloguj się do Workforce Planner API
async function login() {
  const res = await fetch(`${WP_API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: WP_EMAIL, password: WP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  accessToken = data.access_token || data.accessToken;
  refreshToken = data.refresh_token || data.refreshToken;
}

// Odśwież token JWT
async function refreshAuth() {
  const res = await fetch(`${WP_API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${refreshToken}`,
    },
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
  const data = await res.json();
  accessToken = data.access_token || data.accessToken;
  if (data.refresh_token || data.refreshToken) {
    refreshToken = data.refresh_token || data.refreshToken;
  }
}

// Upewnij się że mamy ważny token
async function ensureAuth() {
  if (!isTokenExpired(accessToken)) return;
  if (refreshToken && !isTokenExpired(refreshToken)) {
    try { await refreshAuth(); return; } catch (_) {}
  }
  await login();
}

// Wrapper na fetch z Bearer token
async function wpFetch(path, params = {}) {
  await ensureAuth();
  const url = new URL(`${WP_API_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`WP API ${path}: ${res.status}`);
  return res.json();
}

// Pobierz timeline alokacji
async function getTimeline(startDate, endDate, options = {}) {
  return wpFetch('/api/assignments/timeline', {
    start_date: startDate,
    end_date: endDate,
    ...options,
  });
}

// Pobierz listę pracowników
async function getEmployees(options = {}) {
  return wpFetch('/api/employees', options);
}

// Pobierz listę projektów
async function getProjects() {
  return wpFetch('/api/projects');
}

// Parsuj miesiąc z tekstu ("w marcu" → 3, "Q1" → [1,2,3])
function parseMonthFromText(text) {
  const lower = text.toLowerCase();

  // Kwartały
  const qMatch = lower.match(/q(\d)/);
  if (qMatch) {
    const q = parseInt(qMatch[1]);
    const start = (q - 1) * 3 + 1;
    return { startMonth: start, endMonth: start + 2 };
  }

  // Polskie nazwy miesięcy
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    if (lower.includes(name)) {
      return { startMonth: num, endMonth: num };
    }
  }

  // Domyślnie: bieżący + 2 miesiące
  const now = new Date();
  return { startMonth: now.getMonth() + 1, endMonth: now.getMonth() + 3 };
}

// Zbuduj daty z parsowanych miesięcy
function buildDateRange(text) {
  const { startMonth, endMonth } = parseMonthFromText(text);
  const year = new Date().getFullYear();
  const adjustedEndMonth = endMonth > 12 ? endMonth - 12 : endMonth;
  const endYear = endMonth > 12 ? year + 1 : year;
  const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(endYear, adjustedEndMonth, 0).getDate();
  const endDate = `${endYear}-${String(adjustedEndMonth).padStart(2, '0')}-${lastDay}`;
  return { startDate, endDate };
}

// Wyszukaj dane z Workforce Planner
async function searchWorkforce(query) {
  if (!shouldQueryWorkforce(query)) return null;
  if (!WP_API_URL) return null;

  try {
    const { startDate, endDate } = buildDateRange(query);
    console.log(`[workforce] Query: "${query}" → ${startDate} - ${endDate}`);
    const data = await getTimeline(startDate, endDate);
    console.log(`[workforce] Pobrano dane timeline`);
    return data;
  } catch (error) {
    logError('workforce', 'Błąd pobierania danych z Workforce', error.message);
    return null;
  }
}

// Wyciągnij procent z wartości utilization (może być liczbą lub obiektem {percentage})
function getUtilPercent(val) {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object') return val.percentage || 0;
  return 0;
}

// Wyciągnij procent alokacji z przypisania
function getAllocPercent(assignment) {
  return assignment.allocation_value || assignment.allocation || assignment.percentage || 0;
}

// Zbuduj kontekst z danych Workforce dla Claude (max 4000 znaków)
function buildContextFromWorkforce(data) {
  if (!data) return '';

  try {
    const lines = [];
    let overbookCount = 0;
    let freeCount = 0;
    let totalUtil = 0;
    let empCount = 0;

    // Dane mogą być tablicą pracowników lub obiekt z employees
    const employees = Array.isArray(data) ? data : (data.employees || data.data || []);
    if (employees.length === 0) return '';

    // Grupuj po teamie
    const teams = {};
    for (const emp of employees) {
      const team = emp.team || emp.department || 'Inny';
      if (!teams[team]) teams[team] = [];
      teams[team].push(emp);
    }

    for (const [teamName, members] of Object.entries(teams)) {
      lines.push(`TEAM ${teamName}:`);
      for (const emp of members) {
        const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
        const assignments = emp.assignments || [];
        const utilization = emp.utilization || {};

        // Średnia utylizacja per osoba
        const utilVals = Object.values(utilization).map(getUtilPercent);
        const avgEmpUtil = utilVals.length > 0
          ? Math.round(utilVals.reduce((a, b) => a + b, 0) / utilVals.length)
          : 0;

        if (assignments.length === 0) {
          lines.push(`  ${name}: WOLNY (0%) — brak przypisań`);
          freeCount++;
        } else {
          const parts = assignments.map(a => {
            const proj = a.project_name || a.project || '?';
            const alloc = getAllocPercent(a);
            return `${proj}(${alloc}%)`;
          });
          let status = '';
          if (avgEmpUtil > 100) { status = ' OVERBOOKED!'; overbookCount++; }
          else if (avgEmpUtil < 30) { status = ' CZĘŚCIOWO DOSTĘPNY'; freeCount++; }
          lines.push(`  ${name}: ${parts.join(', ')} → util: ${avgEmpUtil}%${status}`);
        }

        if (utilVals.length > 0) {
          totalUtil += avgEmpUtil;
          empCount++;
        }
      }
    }

    const avgUtil = empCount > 0 ? Math.round(totalUtil / empCount) : 0;
    lines.push(`PODSUMOWANIE: Overbooking: ${overbookCount} os., Wolni/częściowo dostępni: ${freeCount} os., Śr. utilization: ${avgUtil}%`);
    lines.push(`INSTRUKCJA: Odpowiadając o dostępności, pokaż WSZYSTKIE osoby z niską utylizacją (<30%), nie tylko 0%. Podaj imię, team, aktualną utylizację, na jakich projektach pracują i ile mają wolnej kapacity. Formatuj czytelnie z podziałem na teamy.`);

    const content = lines.join('\n');
    const truncated = content.substring(0, 4000);

    return `\n\nKONTEKST Z WORKFORCE PLANNER:\n---\n${truncated}\n---\n`;
  } catch (error) {
    logError('workforce', 'Błąd budowania kontekstu workforce', error.message);
    return '';
  }
}

module.exports = {
  shouldQueryWorkforce,
  isTokenExpired,
  searchWorkforce,
  buildContextFromWorkforce,
  getTimeline,
  getEmployees,
  getProjects,
  parseMonthFromText,
  buildDateRange,
  wpFetch,
  ensureAuth,
  getUtilPercent,
  getAllocPercent,
};
