// src/api/routes.ts — endpointy dashboard API
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { listJobs, runJob } from '../services/scheduler.js';
import { isRedisEnabled, getCacheStats } from '../services/cache.js';
import { APP_VERSION } from '@iwan/shared';

const startTime = Date.now();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: any = null;

// Lazy init Supabase (unikamy importu na starcie jeśli nie potrzeba)
async function getSupabase() {
  if (!supabaseClient) {
    try {
      const { supabase } = await import('../services/supabase.js');
      supabaseClient = supabase;
    } catch {
      return null;
    }
  }
  return supabaseClient;
}

export function createRouter(): Router {
  const router = Router();

  // GET /api/health — bez auth (healthcheck)
  router.get('/api/health', (_req, res) => {
    const jobs = listJobs();
    res.json({
      status: isRedisEnabled() ? 'ok' : 'degraded',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      redis: isRedisEnabled(),
      jobCount: jobs.length,
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  });

  // Reszta endpointów wymaga auth
  router.use('/api', authMiddleware);

  // GET /api/scheduler/jobs — lista jobów
  router.get('/api/scheduler/jobs', (_req, res) => {
    const jobs = listJobs();
    res.json(jobs.map(j => ({
      ...j,
      lastRun: j.lastRun?.toISOString() ?? null,
      status: j.lastRun ? 'idle' : 'idle',
    })));
  });

  // POST /api/scheduler/jobs/:name/trigger — ręczne uruchomienie
  router.post('/api/scheduler/jobs/:name/trigger', async (req, res) => {
    const { name } = req.params;
    const ok = await runJob(name);
    if (!ok) {
      res.status(404).json({ error: `Job '${name}' not found` });
      return;
    }
    res.json({ ok: true, message: `Job '${name}' triggered` });
  });

  // GET /api/errors — ostatnie 50 błędów z Supabase
  router.get('/api/errors', async (_req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/cache/stats — statystyki Redis
  router.get('/api/cache/stats', async (_req, res) => {
    const stats = await getCacheStats();
    res.json(stats);
  });

  // GET /api/channels — lista kanałów z message count
  router.get('/api/channels', async (_req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .rpc('get_channel_stats');
      if (error) {
        // Fallback: prosty select jeśli RPC nie istnieje
        const { data: msgs, error: err2 } = await supabase
          .from('slack_messages')
          .select('channel, channel_name')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (err2) throw err2;
        const channels = new Map<string, { channel: string; channel_name: string | null; count: number }>();
        for (const m of msgs ?? []) {
          const existing = channels.get(m.channel);
          if (existing) {
            existing.count++;
          } else {
            channels.set(m.channel, { channel: m.channel, channel_name: m.channel_name, count: 1 });
          }
        }
        res.json([...channels.values()]);
        return;
      }
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/deals/digests — historia digestów
  router.get('/api/deals/digests', async (_req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('deal_digest_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/workforce/alerts — przegląd alertów
  router.get('/api/workforce/alerts', async (_req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .like('source', 'workforce%')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/config — feature flags (bez sekretów!)
  router.get('/api/config', (_req, res) => {
    const safeKeys = [
      'ENABLE_TOOL_USE', 'ENABLE_PROACTIVE', 'CHANNEL_DIGEST_ENABLED',
      'CHANNEL_ANOMALY_ENABLED', 'ENABLE_DASHBOARD_API',
      'DEAL_DIGEST_HOUR', 'WP_SUMMARY_HOUR', 'CHANNEL_DIGEST_HOUR',
      'PROACTIVE_CONFIDENCE_THRESHOLD', 'WP_LOW_UTIL_THRESHOLD',
      'CHANNEL_ANOMALY_SPIKE_MULTIPLIER', 'WORKFORCE_ANOMALY_ALLOC_DROP_PCT',
      'WORKFORCE_ANOMALY_ALLOC_SPIKE_PCT',
    ];
    const config: Record<string, string | undefined> = {};
    for (const key of safeKeys) {
      config[key] = process.env[key] ?? undefined;
    }
    res.json(config);
  });

  return router;
}
