// src/services/dealConfig.js — wspólna konfiguracja modułów deal
const SALES_PREFIX = process.env.DEAL_SALES_PREFIX || 'sales-';
const MONITORED_CHANNELS = (process.env.DEAL_MONITORED_CHANNELS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const MIN_MESSAGES = parseInt(process.env.DEAL_MIN_MESSAGES, 10) || 3;
const NOTE_PREFIX = process.env.DEAL_NOTE_PREFIX || '[Slack Summary]';
const LANGUAGE = process.env.DEAL_LANGUAGE || 'pl';
const ACTIVE_PIPELINES = (process.env.DEAL_ACTIVE_PIPELINES || '')
  .split(',').map(Number).filter(Boolean);

module.exports = { SALES_PREFIX, MONITORED_CHANNELS, MIN_MESSAGES, NOTE_PREFIX, LANGUAGE, ACTIVE_PIPELINES };
