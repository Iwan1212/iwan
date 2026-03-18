// src/services/cache.ts — warstwa cache Redis (graceful degradation bez REDIS_URL)
import Redis from 'ioredis';
import { logError } from './errors.js';
import { CACHE_TTL } from '@iwan/shared';
import type { CacheStats } from '@iwan/shared';

export { CACHE_TTL };

// Klient Redis — null gdy brak REDIS_URL (app działa bez cache)
const redis: Redis | null = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    })
  : null;

if (redis) {
  redis.on('error', (err) => logError('cache', 'Redis error', err.message));
  redis.on('connect', () => console.log('[cache] Połączono z Redis'));
}

// Sprawdź czy Redis jest dostępny
export function isRedisEnabled(): boolean {
  return redis !== null && redis.status === 'ready';
}

// Pobierz wartość z cache (null = miss lub błąd)
export async function getCache<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (data === null) return null;
    return JSON.parse(data) as T;
  } catch (err) {
    logError('cache', `Błąd odczytu klucza ${key}`, (err as Error).message);
    return null;
  }
}

// Zapisz wartość do cache z TTL
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  if (!redis) return;
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logError('cache', `Błąd zapisu klucza ${key}`, (err as Error).message);
  }
}

// Cache-aside wrapper — pobierz z cache lub wykonaj fetcher i zapisz
export async function withCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  if (fresh !== null && fresh !== undefined) await setCache(key, fresh, ttlSeconds);
  return fresh;
}

// Usuń klucze pasujące do wzorca (np. "pipedrive:notes:42:*")
export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logError('cache', `Błąd invalidacji wzorca ${pattern}`, (err as Error).message);
  }
}

// Statystyki Redis (dla dashboard API)
export async function getCacheStats(): Promise<CacheStats> {
  if (!redis) {
    return { connected: false, usedMemory: '0B', keyCount: 0, connectedClients: 0, uptimeSeconds: 0 };
  }
  try {
    const info = await redis.info();
    const get = (key: string): string => {
      const match = info.match(new RegExp(`${key}:(.+?)\\r?\\n`));
      return match?.[1]?.trim() ?? '0';
    };
    const dbsize = await redis.dbsize();
    return {
      connected: redis.status === 'ready',
      usedMemory: get('used_memory_human'),
      keyCount: dbsize,
      connectedClients: parseInt(get('connected_clients'), 10),
      uptimeSeconds: parseInt(get('uptime_in_seconds'), 10),
    };
  } catch {
    return { connected: false, usedMemory: '0B', keyCount: 0, connectedClients: 0, uptimeSeconds: 0 };
  }
}

// Zamknij połączenie z Redis (graceful shutdown)
export async function disconnectCache(): Promise<void> {
  if (!redis) return;
  try {
    await redis.quit();
  } catch (err) {
    logError('cache', 'Błąd zamykania Redis', (err as Error).message);
  }
}
