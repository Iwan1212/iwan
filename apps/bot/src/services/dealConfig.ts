// src/services/dealConfig.ts — wspólna konfiguracja modułów deal
export const SALES_PREFIX = process.env.DEAL_SALES_PREFIX || 'sales-';
export const MONITORED_CHANNELS = (process.env.DEAL_MONITORED_CHANNELS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
export const MIN_MESSAGES = parseInt(process.env.DEAL_MIN_MESSAGES || '', 10) || 3;
export const NOTE_PREFIX = process.env.DEAL_NOTE_PREFIX || '[Slack Summary]';
export const LANGUAGE = process.env.DEAL_LANGUAGE || 'pl';
export const ACTIVE_PIPELINES = (process.env.DEAL_ACTIVE_PIPELINES || '')
  .split(',').map(Number).filter(Boolean);
