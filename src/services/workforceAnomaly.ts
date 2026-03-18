// src/services/workforceAnomaly.ts — detekcja anomalii alokacji workforce
import { getTimeline, getUtilPercent } from './workforce.js';
import { getCache, setCache, CACHE_TTL } from './cache.js';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const ALERT_CHANNEL = process.env.WP_ALERT_CHANNEL || '';
const ALLOC_DROP_PCT = parseInt(process.env.WORKFORCE_ANOMALY_ALLOC_DROP_PCT || '', 10) || 30;
const ALLOC_SPIKE_PCT = parseInt(process.env.WORKFORCE_ANOMALY_ALLOC_SPIKE_PCT || '', 10) || 50;
const SNAPSHOT_KEY = 'workforce:anomaly:prev_snapshot';

interface EmployeeSnapshot {
  id: string;
  name: string;
  team: string;
  totalAllocation: number;
  onBench: boolean;
  overbooked: boolean;
}

interface WorkforceSnapshot {
  timestamp: string;
  employees: EmployeeSnapshot[];
}

export type AnomalyType = 'new_overbooking' | 'new_bench' | 'alloc_drop' | 'alloc_spike';

interface AnomalyAlert {
  type: AnomalyType;
  employeeName: string;
  team: string;
  detail: string;
}

// Zbuduj snapshot z danych timeline
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSnapshot(data: any): WorkforceSnapshot {
  const employees: EmployeeSnapshot[] = [];
  const rawEmployees = Array.isArray(data) ? data : (data?.employees || data?.data || []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const emp of rawEmployees) {
    const name = emp.name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    const id = String(emp.id || emp.employee_id || name);
    const team = emp.team || emp.department || 'Inny';

    // Oblicz sumaryczną alokację z utilization
    const utilization = emp.utilization || {};
    const utilValues = Object.values(utilization).map(getUtilPercent);
    const totalAllocation = utilValues.length > 0
      ? Math.round(utilValues.reduce((a: number, b: number) => a + b, 0) / utilValues.length)
      : 0;

    employees.push({
      id,
      name,
      team,
      totalAllocation,
      onBench: totalAllocation === 0,
      overbooked: totalAllocation > 100,
    });
  }

  return { timestamp: new Date().toISOString(), employees };
}

// Wykryj anomalie porównując bieżący i poprzedni snapshot
export function detectAnomalies(current: WorkforceSnapshot, previous: WorkforceSnapshot): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];
  const prevMap = new Map(previous.employees.map(e => [e.id, e]));

  for (const emp of current.employees) {
    const prev = prevMap.get(emp.id);
    if (!prev) continue;

    // Nowy overbooking (było <=100%, jest >100%)
    if (emp.overbooked && !prev.overbooked) {
      alerts.push({
        type: 'new_overbooking',
        employeeName: emp.name,
        team: emp.team,
        detail: `${prev.totalAllocation}% → ${emp.totalAllocation}%`,
      });
    }

    // Nowy bench (miał alokację, teraz 0%)
    if (emp.onBench && !prev.onBench) {
      alerts.push({
        type: 'new_bench',
        employeeName: emp.name,
        team: emp.team,
        detail: `${prev.totalAllocation}% → 0%`,
      });
    }

    // Spadek alokacji (>ALLOC_DROP_PCT procent)
    if (prev.totalAllocation > 0 && !emp.onBench) {
      const dropPct = ((prev.totalAllocation - emp.totalAllocation) / prev.totalAllocation) * 100;
      if (dropPct >= ALLOC_DROP_PCT) {
        alerts.push({
          type: 'alloc_drop',
          employeeName: emp.name,
          team: emp.team,
          detail: `${prev.totalAllocation}% → ${emp.totalAllocation}% (spadek ${Math.round(dropPct)}%)`,
        });
      }
    }

    // Skok alokacji (>ALLOC_SPIKE_PCT procent)
    if (prev.totalAllocation > 0) {
      const spikePct = ((emp.totalAllocation - prev.totalAllocation) / prev.totalAllocation) * 100;
      if (spikePct >= ALLOC_SPIKE_PCT) {
        alerts.push({
          type: 'alloc_spike',
          employeeName: emp.name,
          team: emp.team,
          detail: `${prev.totalAllocation}% → ${emp.totalAllocation}% (wzrost ${Math.round(spikePct)}%)`,
        });
      }
    }
  }

  return alerts;
}

// Formatuj alert do wiadomości Slack
function formatAnomalyAlert(alert: AnomalyAlert): string {
  const icons: Record<AnomalyType, string> = {
    new_overbooking: '🔴',
    new_bench: '🟡',
    alloc_drop: '📉',
    alloc_spike: '📈',
  };
  const labels: Record<AnomalyType, string> = {
    new_overbooking: 'Nowy overbooking',
    new_bench: 'Nowy bench',
    alloc_drop: 'Spadek alokacji',
    alloc_spike: 'Skok alokacji',
  };
  return `${icons[alert.type]} *${labels[alert.type]}:* ${alert.employeeName} (${alert.team}) — ${alert.detail}`;
}

// Formatuj datę jako YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Sprawdź anomalie workforce (wywoływane przez scheduler)
export async function checkWorkforceAnomalies(app: SlackApp): Promise<void> {
  if (!ALERT_CHANNEL) return;

  try {
    // 1. Pobierz bieżące dane timeline
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);
    const data = await getTimeline(formatDate(now), formatDate(endDate));
    const current = buildSnapshot(data);

    // 2. Pobierz poprzedni snapshot z Redis
    const previous = await getCache<WorkforceSnapshot>(SNAPSHOT_KEY);

    // 3. Pierwszy run — zapisz snapshot i wróć
    if (!previous) {
      await setCache(SNAPSHOT_KEY, current, CACHE_TTL.WORKFORCE_ANOMALY_SNAPSHOT);
      console.log('[workforce-anomaly] First run — snapshot saved');
      return;
    }

    // 4. Wykryj anomalie
    const anomalies = detectAnomalies(current, previous);

    // 5. Wyślij alerty
    if (anomalies.length > 0) {
      const message = `*Workforce Anomaly Alert*\n${anomalies.map(formatAnomalyAlert).join('\n')}`;
      await app.client.chat.postMessage({
        channel: ALERT_CHANNEL,
        text: message,
      });
      console.log(`[workforce-anomaly] Wysłano ${anomalies.length} alertów`);
    }

    // 6. Zapisz nowy snapshot
    await setCache(SNAPSHOT_KEY, current, CACHE_TTL.WORKFORCE_ANOMALY_SNAPSHOT);
  } catch (error) {
    logError('workforce-anomaly', 'Błąd sprawdzania anomalii', (error as Error).message);
  }
}
