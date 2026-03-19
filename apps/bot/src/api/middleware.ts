// src/api/middleware.ts -- middleware Express dla dashboard API
import type { Request, Response, NextFunction } from 'express';
import type { DashboardRole } from '../types/index.js';

// Rozszerz Express locals o role dashboardu
declare module 'express' {
  interface Locals {
    dashboardRole?: DashboardRole;
  }
}

// Zbuduj mape tokenow -> rol (dynamicznie z env, bez cache)
function resolveTokenRole(token: string): DashboardRole | null {
  const leadershipToken = process.env.DASHBOARD_TOKEN_LEADERSHIP;
  const growthToken = process.env.DASHBOARD_TOKEN_GROWTH;
  const legacyToken = process.env.DASHBOARD_API_TOKEN;

  if (leadershipToken && token === leadershipToken) return 'leadership';
  if (growthToken && token === growthToken) return 'growth';
  // Backward compat: stary DASHBOARD_API_TOKEN = leadership
  if (legacyToken && token === legacyToken) return 'leadership';

  return null;
}

// Czy jakikolwiek token jest skonfigurowany?
function hasAnyToken(): boolean {
  return !!(
    process.env.DASHBOARD_TOKEN_LEADERSHIP ||
    process.env.DASHBOARD_TOKEN_GROWTH ||
    process.env.DASHBOARD_API_TOKEN
  );
}

// Bearer token auth z rozpoznawaniem roli (leadership | growth)
export function authMiddlewareWithRole(req: Request, res: Response, next: NextFunction): void {
  if (!hasAnyToken()) {
    res.status(503).json({ error: 'Dashboard API token not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const provided = authHeader.slice(7);
  const role = resolveTokenRole(provided);
  if (!role) {
    res.status(403).json({ error: 'Invalid token' });
    return;
  }

  if (!res.locals) res.locals = {};
  res.locals.dashboardRole = role;
  next();
}

// Backward compat: stary middleware (deleguje do nowego)
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  authMiddlewareWithRole(req, res, next);
}
