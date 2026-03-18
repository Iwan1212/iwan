// src/services/scheduler.ts — scentralizowany scheduler zadań cron
import cron, { type ScheduledTask } from 'node-cron';
import { logError } from './errors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

interface ScheduledJob {
  name: string;
  expression: string;
  task: ScheduledTask;
  lastRun: Date | null;
  lastDurationMs: number | null;
}

const jobs = new Map<string, ScheduledJob>();

// Zarejestruj zadanie cron (z logowaniem i obsługą błędów)
export function registerJob(name: string, expression: string, handler: () => Promise<void> | void): void {
  if (jobs.has(name)) {
    console.log(`[scheduler] Job '${name}' already registered — skipping`);
    return;
  }

  const task = cron.schedule(expression, async () => {
    const start = Date.now();
    console.log(`[scheduler] Running '${name}'...`);
    try {
      await handler();
      const duration = Date.now() - start;
      const job = jobs.get(name);
      if (job) {
        job.lastRun = new Date();
        job.lastDurationMs = duration;
      }
      console.log(`[scheduler] '${name}' done (${duration}ms)`);
    } catch (error) {
      logError('scheduler', `Job '${name}' failed`, (error as Error).message);
    }
  }, { timezone: 'Europe/Warsaw' });

  jobs.set(name, { name, expression, task, lastRun: null, lastDurationMs: null });
  console.log(`[scheduler] Registered '${name}' (${expression})`);
}

// Lista zarejestrowanych zadań
export function listJobs(): { name: string; expression: string; lastRun: Date | null }[] {
  return [...jobs.values()].map(j => ({
    name: j.name,
    expression: j.expression,
    lastRun: j.lastRun,
  }));
}

// Zatrzymaj wszystkie zadania (graceful shutdown)
export function stopAll(): void {
  for (const [name, job] of jobs) {
    job.task.stop();
    console.log(`[scheduler] Stopped '${name}'`);
  }
  jobs.clear();
  console.log('[scheduler] All jobs stopped');
}

// Inicjalizuj wszystkie joby (warunkowo wg env vars)
export async function initScheduler(app: SlackApp): Promise<void> {
  const DIGEST_HOUR = parseInt(process.env.DEAL_DIGEST_HOUR || '', 10) || 7;
  const SUMMARY_HOUR = parseInt(process.env.WP_SUMMARY_HOUR || '', 10) || 8;
  const CD_HOUR = parseInt(process.env.CHANNEL_DIGEST_HOUR || '', 10) || 8;

  // deal-digest: Pn-Pt o DIGEST_HOUR
  if (process.env.PIPEDRIVE_API_TOKEN) {
    const { runDailyDigest } = await import('./dealDigest.js');
    registerJob('deal-digest', `0 ${DIGEST_HOUR} * * 1-5`, () => runDailyDigest(app));
  }

  // deal-inactive-check: Pn-Pt o 9:00
  if (process.env.PIPEDRIVE_API_TOKEN) {
    const { checkInactiveChannels } = await import('./dealDigest.js');
    registerJob('deal-inactive-check', '0 9 * * 1-5', () => checkInactiveChannels(app));
  }

  // workforce-alerts: codziennie o 8:00
  if (process.env.WP_ALERT_CHANNEL && process.env.WP_API_URL) {
    const { checkAlerts } = await import('./workforceAlerts.js');
    registerJob('workforce-alerts', '0 8 * * *', () => checkAlerts(app));
  }

  // workforce-alerts-cleanup: codziennie o 3:00
  if (process.env.WP_ALERT_CHANNEL) {
    const { clearOldAlerts } = await import('./workforceAlerts.js');
    registerJob('workforce-alerts-cleanup', '0 3 * * *', () => clearOldAlerts());
  }

  // workforce-weekly-summary: poniedziałek o SUMMARY_HOUR
  if (process.env.WP_SUMMARY_CHANNEL && process.env.WP_API_URL) {
    const { generateWeeklySummary } = await import('./workforceAlerts.js');
    registerJob('workforce-weekly-summary', `0 ${SUMMARY_HOUR} * * 1`, () => generateWeeklySummary(app));
  }

  // workforce-anomaly: Pn-Pt o 9:00
  if (process.env.WP_ALERT_CHANNEL && process.env.WP_API_URL) {
    const { checkWorkforceAnomalies } = await import('./workforceAnomaly.js');
    registerJob('workforce-anomaly', '0 9 * * 1-5', () => checkWorkforceAnomalies(app));
  }

  // channel-digest: Pn-Pt o CD_HOUR
  if (process.env.CHANNEL_DIGEST_ENABLED === 'true') {
    const { runChannelDigest } = await import('./channelDigest.js');
    registerJob('channel-digest', `0 ${CD_HOUR} * * 1-5`, () => runChannelDigest(app));
  }

  // channel-anomaly: co 30 min
  if (process.env.CHANNEL_ANOMALY_ENABLED === 'true') {
    const { checkChannelAnomalies } = await import('./channelAnomaly.js');
    registerJob('channel-anomaly', '*/30 * * * *', () => checkChannelAnomalies(app));
  }

  // proactive-cleanup: co godzinę
  if (process.env.ENABLE_PROACTIVE === 'true') {
    const { cleanupThreads } = await import('../proactive/threadTracker.js');
    registerJob('proactive-cleanup', '0 * * * *', () => { cleanupThreads(); });
  }

  // health-check: co 5 min (zawsze aktywny)
  registerJob('health-check', '*/5 * * * *', () => {
    console.log(`[health] Iwan alive — ${new Date().toISOString()}`);
  });

  console.log(`[scheduler] Registered ${jobs.size} jobs`);
}

// Dla testów — dostęp do mapy jobów
export function _getJobs(): Map<string, ScheduledJob> {
  return jobs;
}
