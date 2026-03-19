// src/api/routes.ts -- endpointy dashboard API z role-based filtering
import { Router } from 'express';
import { authMiddlewareWithRole } from './middleware.js';
import { listJobs, runJob } from '../services/scheduler.js';
import { isRedisEnabled, getCacheStats } from '../services/cache.js';
import { setChannelAccessLevel } from '../services/channelClassification.js';
import { APP_VERSION } from '@iwan/shared';
import type { DashboardRole, AccessLevel, ChannelLabel } from '@iwan/shared';

const startTime = Date.now();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: any = null;

// Lazy init Supabase (unikamy importu na starcie jesli nie potrzeba)
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

// Pobierz kanaly dostepne dla roli (growth widzi tylko open + growth)
async function getAccessibleChannelIds(role: DashboardRole): Promise<Set<string> | null> {
  if (role === 'leadership') return null; // leadership widzi wszystko

  const supabase = await getSupabase();
  if (!supabase) return new Set();

  try {
    const { data } = await supabase
      .from('channel_access_levels')
      .select('channel_id')
      .or('access_level.eq.open,label.eq.growth');

    return new Set((data ?? []).map((r: { channel_id: string }) => r.channel_id));
  } catch {
    return new Set();
  }
}

export function createRouter(): Router {
  const router = Router();

  // GET /api/health -- bez auth (healthcheck)
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

  // Reszta endpointow wymaga auth z rola
  router.use('/api', authMiddlewareWithRole);

  // GET /api/scheduler/jobs -- lista jobow
  router.get('/api/scheduler/jobs', (_req, res) => {
    const jobs = listJobs();
    res.json(jobs.map(j => ({
      ...j,
      lastRun: j.lastRun?.toISOString() ?? null,
      status: j.lastRun ? 'idle' : 'idle',
    })));
  });

  // POST /api/scheduler/jobs/:name/trigger -- reczne uruchomienie
  router.post('/api/scheduler/jobs/:name/trigger', async (req, res) => {
    const { name } = req.params;
    const ok = await runJob(name);
    if (!ok) {
      res.status(404).json({ error: `Job '${name}' not found` });
      return;
    }
    res.json({ ok: true, message: `Job '${name}' triggered` });
  });

  // GET /api/errors -- ostatnie 50 bledow z Supabase
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

  // GET /api/cache/stats -- statystyki Redis
  router.get('/api/cache/stats', async (_req, res) => {
    const stats = await getCacheStats();
    res.json(stats);
  });

  // GET /api/channels -- lista kanalow z message count (filtrowana per rola)
  router.get('/api/channels', async (_req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }
    const role = res.locals.dashboardRole as DashboardRole;
    const allowedChannels = await getAccessibleChannelIds(role);

    try {
      const { data, error } = await supabase
        .rpc('get_channel_stats');
      if (error) {
        // Fallback: prosty select jesli RPC nie istnieje
        const { data: msgs, error: err2 } = await supabase
          .from('slack_messages')
          .select('channel, channel_name')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (err2) throw err2;
        const channels = new Map<string, { channel: string; channel_name: string | null; count: number }>();
        for (const m of msgs ?? []) {
          // Filtruj kanaly per rola
          if (allowedChannels && !allowedChannels.has(m.channel)) continue;
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

      // Filtruj wyniki RPC per rola
      const filtered = allowedChannels
        ? (data ?? []).filter((r: { channel: string }) => allowedChannels.has(r.channel))
        : (data ?? []);
      res.json(filtered);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/deals/digests -- historia digestow
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

  // GET /api/workforce/alerts -- przeglad alertow
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

  // GET /api/config -- feature flags (bez sekretow!)
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

  // GET /api/audit -- logi audytowe (filtrowane per rola)
  router.get('/api/audit', async (req, res) => {
    const supabase = await getSupabase();
    if (!supabase) {
      res.json([]);
      return;
    }

    const role = res.locals.dashboardRole as DashboardRole;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 500);

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      // Filtry opcjonalne
      if (req.query.user_id) query = query.eq('user_id', req.query.user_id);
      if (req.query.tool_name) query = query.eq('tool_name', req.query.tool_name);
      if (req.query.result_status) query = query.eq('result_status', req.query.result_status);

      // Growth widzi tylko logi z dostepnych kanalow
      if (role === 'growth') {
        const allowedChannels = await getAccessibleChannelIds(role);
        if (allowedChannels && allowedChannels.size > 0) {
          query = query.in('channel_id', [...allowedChannels]);
        } else {
          res.json([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      res.json(data ?? []);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/channels/:id/access -- ustaw access level kanalu (tylko leadership)
  router.post('/api/channels/:id/access', async (req, res) => {
    const role = res.locals.dashboardRole as DashboardRole;
    if (role !== 'leadership') {
      res.status(403).json({ error: 'Only leadership role can modify channel access levels' });
      return;
    }

    const channelId = req.params.id;
    const { access_level, label } = req.body || {};

    if (!access_level || !['open', 'restricted'].includes(access_level)) {
      res.status(400).json({ error: 'Invalid access_level. Must be "open" or "restricted".' });
      return;
    }

    if (label && !['leadership', 'growth', 'general'].includes(label)) {
      res.status(400).json({ error: 'Invalid label. Must be "leadership", "growth", or "general".' });
      return;
    }

    const ok = await setChannelAccessLevel(
      channelId,
      access_level as AccessLevel,
      (label as ChannelLabel) ?? null,
    );

    if (!ok) {
      res.status(500).json({ error: 'Failed to update channel access level' });
      return;
    }

    res.json({ ok: true, channel_id: channelId, access_level, label: label ?? null });
  });

  return router;
}
