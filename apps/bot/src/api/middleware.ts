// src/api/middleware.ts — middleware Express dla dashboard API
import type { Request, Response, NextFunction } from 'express';

// Bearer token auth — sprawdza DASHBOARD_API_TOKEN z env
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.DASHBOARD_API_TOKEN;
  if (!token) {
    res.status(503).json({ error: 'Dashboard API token not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const provided = authHeader.slice(7);
  if (provided !== token) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }

  next();
}
