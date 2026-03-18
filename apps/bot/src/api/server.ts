// src/api/server.ts — Express server dla dashboard API
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createRouter } from './routes.js';
import { DEFAULT_API_PORT } from '@iwan/shared';

// Uruchom serwer API (guard: ENABLE_DASHBOARD_API=true)
export async function startApiServer(): Promise<void> {
  if (process.env.ENABLE_DASHBOARD_API !== 'true') {
    console.log('[api] Dashboard API disabled (set ENABLE_DASHBOARD_API=true to enable)');
    return;
  }

  const port = parseInt(process.env.DASHBOARD_API_PORT || '', 10) || DEFAULT_API_PORT;
  const server = express();

  // CORS w dev mode
  if (process.env.NODE_ENV !== 'production') {
    server.use(cors());
  }

  server.use(express.json());

  // API routes
  const router = createRouter();
  server.use(router);

  // Production: serwuj dashboard jako static files
  const dashboardDist = path.resolve(__dirname, '../../../../apps/dashboard/dist');
  server.use(express.static(dashboardDist));

  // SPA fallback
  server.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(dashboardDist, 'index.html'));
  });

  server.listen(port, () => {
    console.log(`[api] Dashboard API running on port ${port}`);
  });
}
