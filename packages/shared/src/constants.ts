// packages/shared/src/constants.ts — współdzielone stałe projektu Iwan

// TTL cache w sekundach
export const CACHE_TTL = {
  NOTION_SEARCH: 30 * 60,
  NOTION_PAGE: 60 * 60,
  PIPEDRIVE_SEARCH: 15 * 60,
  PIPEDRIVE_DEAL: 30 * 60,
  PIPEDRIVE_NOTES: 30 * 60,
  WORKFORCE_TIMELINE: 2 * 60 * 60,
  CALENDAR_EVENTS: 30 * 60,
  CALAMARI_ABSENCES: 60 * 60,
  USER_NAME: 24 * 60 * 60,
  CHANNEL_NAME: 24 * 60 * 60,
  WORKFORCE_ANOMALY_SNAPSHOT: 90000,
} as const;

// Domyślny port dashboard API
export const DEFAULT_API_PORT = 3100;

// Wersja aplikacji
export const APP_VERSION = '0.1.0';
