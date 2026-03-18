// tests/api/routes.test.js — testy endpointów dashboard API

// Mockujemy moduły przed importem
jest.mock('../../src/services/scheduler', () => ({
  listJobs: jest.fn(() => [
    { name: 'health-check', expression: '*/5 * * * *', lastRun: new Date('2024-01-01T12:00:00Z'), lastDurationMs: 5 },
    { name: 'deal-digest', expression: '0 7 * * 1-5', lastRun: null, lastDurationMs: null },
  ]),
  runJob: jest.fn(async (name) => name === 'health-check'),
}));

jest.mock('../../src/services/cache', () => ({
  isRedisEnabled: jest.fn(() => true),
  getCacheStats: jest.fn(async () => ({
    connected: true,
    usedMemory: '1.2M',
    keyCount: 42,
    connectedClients: 3,
    uptimeSeconds: 86400,
  })),
}));

jest.mock('../../src/services/supabase', () => ({
  supabase: {
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      like: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({
        data: table === 'error_logs'
          ? [{ source: 'test', message: 'error', created_at: '2024-01-01', details: null }]
          : table === 'deal_digest_state'
            ? [{ channel: 'deals', deal_id: 1, updated_at: '2024-01-01' }]
            : [],
        error: null,
      }),
    })),
    rpc: jest.fn().mockReturnValue({ data: null, error: { message: 'not found' } }),
  },
}));

const express = require('express');
const { createRouter } = require('../../src/api/routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(createRouter());
  return app;
}

// Prosty helper do testów HTTP (bez supertest — lekki)
function makeRequest(app, method, path, token) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(`http://localhost:${port}${path}`, { method, headers })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          server.close();
          resolve({ status: res.status, body });
        })
        .catch((err) => {
          server.close();
          resolve({ status: 500, body: { error: err.message } });
        });
    });
  });
}

describe('Dashboard API routes', () => {
  let app;

  beforeAll(() => {
    process.env.DASHBOARD_API_TOKEN = 'test-token-123';
  });

  beforeEach(() => {
    app = buildApp();
  });

  afterAll(() => {
    delete process.env.DASHBOARD_API_TOKEN;
  });

  describe('GET /api/health', () => {
    it('returns health status without auth', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/health');
      expect(status).toBe(200);
      expect(body.status).toBe('ok');
      expect(body.redis).toBe(true);
      expect(body.jobCount).toBe(2);
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/scheduler/jobs', () => {
    it('returns 401 without token', async () => {
      const { status } = await makeRequest(app, 'GET', '/api/scheduler/jobs');
      expect(status).toBe(401);
    });

    it('returns jobs list with valid token', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/scheduler/jobs', 'test-token-123');
      expect(status).toBe(200);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('health-check');
      expect(body[0].lastRun).toBeDefined();
      expect(body[1].name).toBe('deal-digest');
    });
  });

  describe('POST /api/scheduler/jobs/:name/trigger', () => {
    it('triggers existing job', async () => {
      const { status, body } = await makeRequest(app, 'POST', '/api/scheduler/jobs/health-check/trigger', 'test-token-123');
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
    });

    it('returns 404 for unknown job', async () => {
      const { status } = await makeRequest(app, 'POST', '/api/scheduler/jobs/nonexistent/trigger', 'test-token-123');
      expect(status).toBe(404);
    });
  });

  describe('GET /api/errors', () => {
    it('returns error logs', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/errors', 'test-token-123');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty('source');
      expect(body[0]).toHaveProperty('message');
    });
  });

  describe('GET /api/cache/stats', () => {
    it('returns cache statistics', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/cache/stats', 'test-token-123');
      expect(status).toBe(200);
      expect(body.connected).toBe(true);
      expect(body.keyCount).toBe(42);
      expect(body).toHaveProperty('usedMemory');
      expect(body).toHaveProperty('connectedClients');
    });
  });

  describe('GET /api/channels', () => {
    it('returns channel data', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/channels', 'test-token-123');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/deals/digests', () => {
    it('returns digest history', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/deals/digests', 'test-token-123');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/workforce/alerts', () => {
    it('returns workforce alerts', async () => {
      const { status, body } = await makeRequest(app, 'GET', '/api/workforce/alerts', 'test-token-123');
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/config', () => {
    it('returns safe config values', async () => {
      process.env.ENABLE_TOOL_USE = 'true';
      process.env.ANTHROPIC_API_KEY = 'sk-secret';
      const { status, body } = await makeRequest(app, 'GET', '/api/config', 'test-token-123');
      expect(status).toBe(200);
      expect(body.ENABLE_TOOL_USE).toBe('true');
      // Sekrety NIE powinny wyciekać
      expect(body.ANTHROPIC_API_KEY).toBeUndefined();
      expect(body.SLACK_BOT_TOKEN).toBeUndefined();
      delete process.env.ENABLE_TOOL_USE;
    });
  });
});
