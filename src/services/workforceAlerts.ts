// src/services/workforceAlerts.ts — proaktywne alerty overbookingu + weekly summary
import { getTimeline, getUtilPercent, getAllocPercent } from './workforce.js';
import { askClaude } from './claude.js';
import { toSlackMarkdown } from './format.js';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const ALERT_CHANNEL = process.env.WP_ALERT_CHANNEL || '';
const ALERT_INTERVAL = (parseInt(process.env.WP_ALERT_INTERVAL_HOURS || '', 10) || 24) * 3600 * 1000;
const LOW_UTIL_THRESHOLD = parseInt(process.env.WP_LOW_UTIL_THRESHOLD || '', 10) || 20;
const SUMMARY_CHANNEL = process.env.WP_SUMMARY_CHANNEL || '';
const SUMMARY_HOUR = parseInt(process.env.WP_SUMMARY_HOUR || '', 10) || 8;

// Deduplikacja alertów (klucz: empId-month-type)
const sentAlerts = new Set<string>();

// Wyczyść stare alerty raz na dobę
function clearOldAlerts(): void {
  sentAlerts.clear();
}

// Formatuj datę jako YYYY-MM-DD
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Sprawdź alerty overbookingu i niskiej utylizacji
export async function checkAlerts(app: SlackApp): Promise<void> {
  if (!ALERT_CHANNEL) return;

  try {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    const data = await getTimeline(formatDate(now), formatDate(endDate));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: any[] = Array.isArray(data) ? data : ((data as any).employees || (data as any).data || []);

    const alerts: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const emp of employees) {
      const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
      const empId = emp.id || emp.employee_id || name;
      const utilization = emp.utilization || {};

      for (const [month, val] of Object.entries(utilization)) {
        const pct = getUtilPercent(val);
        // Overbooking
        if (pct > 100) {
          const key = `${empId}-${month}-overbook`;
          if (!sentAlerts.has(key)) {
            alerts.push(`⚠️ *Overbooking:* ${name} — ${month}: ${pct}%`);
            sentAlerts.add(key);
          }
        }
        // Niska utylizacja
        if (pct < LOW_UTIL_THRESHOLD && pct >= 0) {
          const key = `${empId}-${month}-lowutil`;
          if (!sentAlerts.has(key)) {
            alerts.push(`📉 *Niska utylizacja:* ${name} — ${month}: ${pct}%`);
            sentAlerts.add(key);
          }
        }
      }
    }

    if (alerts.length > 0) {
      const message = `*Workforce Alert*\n${alerts.join('\n')}`;
      await app.client.chat.postMessage({
        channel: ALERT_CHANNEL,
        text: message,
      });
      console.log(`[workforce-alerts] Wysłano ${alerts.length} alertów`);
    }
  } catch (error) {
    logError('workforce-alerts', 'Błąd sprawdzania alertów', (error as Error).message);
  }
}

// Włącz cykliczne sprawdzanie alertów
export function setupWorkforceAlerts(app: SlackApp): void {
  if (!ALERT_CHANNEL || !process.env.WP_API_URL) {
    console.log('[workforce-alerts] Brak konfiguracji — alerty wyłączone');
    return;
  }

  // Pierwsze sprawdzenie po 1 min od startu
  setTimeout(() => checkAlerts(app), 60 * 1000);

  // Kolejne co ALERT_INTERVAL
  setInterval(() => checkAlerts(app), ALERT_INTERVAL);

  // Czyść deduplikację co 24h
  setInterval(clearOldAlerts, 24 * 3600 * 1000);

  console.log(`[workforce-alerts] Alerty włączone (co ${ALERT_INTERVAL / 3600000}h)`);
}

// Generuj cotygodniowe podsumowanie alokacji
export async function generateWeeklySummary(app: SlackApp): Promise<void> {
  if (!SUMMARY_CHANNEL) return;

  try {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 2);

    const data = await getTimeline(formatDate(now), formatDate(endDate));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: any[] = Array.isArray(data) ? data : ((data as any).employees || (data as any).data || []);

    if (employees.length === 0) {
      console.log('[workforce-summary] Brak danych — pomijam');
      return;
    }

    // Zbuduj surowe dane do przekazania Claude
    const rawData = buildRawSummaryData(employees, now);

    const prompt = `Na podstawie poniższych danych z Workforce Planner wygeneruj cotygodniowe podsumowanie alokacji zespołu po polsku. Użyj formatowania Slack (gwiazdki do bolda, bullet points z •). Podsumowanie powinno zawierać:
1. Ogólną utylizację firmy (%)
2. Utylizację per team
3. Listę osób na benchu (0% alokacji)
4. Overbookowanych osób (>100%)
5. Kończące się przypisania w tym tygodniu
6. Nowe przypisania z ostatniego tygodnia

Dane:
${rawData}`;

    const summary = await askClaude(prompt, 'Iwan');
    const formatted = toSlackMarkdown(summary);

    await app.client.chat.postMessage({
      channel: SUMMARY_CHANNEL,
      text: formatted,
    });

    console.log('[workforce-summary] Wysłano weekly summary');
  } catch (error) {
    logError('workforce-summary', 'Błąd generowania weekly summary', (error as Error).message);
  }
}

// Zbuduj surowe dane dla Claude
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildRawSummaryData(employees: any[], now: Date): string {
  const lines: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams: Record<string, any[]> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const emp of employees) {
    const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const team = emp.team || emp.department || 'Inny';
    if (!teams[team]) teams[team] = [];

    const assignments = emp.assignments || [];
    const utilization = emp.utilization || {};

    teams[team].push({ name, assignments, utilization });
  }

  for (const [teamName, members] of Object.entries(teams)) {
    lines.push(`Team: ${teamName}`);
    for (const m of members) {
      const assignStr = m.assignments.length > 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? m.assignments.map((a: any) => {
            const proj = a.project_name || a.project || '?';
            const alloc = getAllocPercent(a);
            const start = a.start_date || '';
            const end = a.end_date || '';
            return `${proj}(${alloc}%,${start}-${end})`;
          }).join('; ')
        : 'bench';
      const utilStr = Object.entries(m.utilization).map(([k, v]) => `${k}:${getUtilPercent(v)}%`).join(',');
      lines.push(`  ${m.name}: ${assignStr} | util: ${utilStr || '0%'}`);
    }
  }

  lines.push(`Data raportu: ${formatDate(now)}`);
  return lines.join('\n');
}

// Sprawdź czy to poniedziałek o odpowiedniej godzinie
export function isWeeklySummaryTime(now: Date): boolean {
  return now.getDay() === 1 && now.getHours() === SUMMARY_HOUR;
}

// Włącz cotygodniowe podsumowanie (sprawdza co godzinę)
export function setupWeeklySummary(app: SlackApp): void {
  if (!SUMMARY_CHANNEL || !process.env.WP_API_URL) {
    console.log('[workforce-summary] Brak konfiguracji — summary wyłączone');
    return;
  }

  setInterval(() => {
    if (isWeeklySummaryTime(new Date())) {
      generateWeeklySummary(app);
    }
  }, 3600 * 1000);

  console.log(`[workforce-summary] Weekly summary włączone (poniedziałek ${SUMMARY_HOUR}:00)`);
}
