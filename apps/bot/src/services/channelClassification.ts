// src/services/channelClassification.ts -- klasyfikacja kanalow (access level + label)

import { supabase } from './supabase.js';
import { withCache } from './cache.js';
import { isUserInChannel } from './membership.js';
import { logError } from './errors.js';
import type { AccessLevel, ChannelLabel } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

const CLASSIFICATION_TTL = 600; // 10 minut

interface ChannelAccessRow {
  channel_id: string;
  access_level: AccessLevel;
  label: string | null;
}

// Pobierz rekord access level kanalu z Supabase (cache 10 min)
async function getChannelAccessRow(channelId: string): Promise<ChannelAccessRow | null> {
  return withCache(`channel-access:${channelId}`, CLASSIFICATION_TTL, async () => {
    try {
      const { data, error } = await supabase
        .from('channel_access_levels')
        .select('channel_id, access_level, label')
        .eq('channel_id', channelId)
        .single();

      if (error || !data) return null;
      return data as ChannelAccessRow;
    } catch (err) {
      logError('channelClassification', `Blad pobierania access level ${channelId}`, (err as Error).message);
      return null;
    }
  });
}

// Pobierz access level kanalu (domyslnie 'restricted')
export async function getChannelAccessLevel(channelId: string): Promise<AccessLevel> {
  const row = await getChannelAccessRow(channelId);
  return row?.access_level ?? 'restricted';
}

// Pobierz label kanalu (np. 'leadership', 'growth', null)
export async function getChannelLabel(channelId: string): Promise<ChannelLabel | null> {
  const row = await getChannelAccessRow(channelId);
  return (row?.label as ChannelLabel) ?? null;
}

// Czy user ma dostep do danych z kanalu docelowego?
export async function canUserAccessChannel(
  app: SlackApp,
  userId: string,
  sourceChannelId: string,
  targetChannelId: string,
): Promise<boolean> {
  // Zawsze widzisz wlasny kanal
  if (sourceChannelId === targetChannelId) return true;

  const accessLevel = await getChannelAccessLevel(targetChannelId);

  // Kanaly 'open' — dostep dla wszystkich
  if (accessLevel === 'open') return true;

  // Kanaly 'restricted' — wymagany membership check
  return isUserInChannel(app, userId, targetChannelId);
}

// Ustaw access level kanalu (admin only — wywolywane z API)
export async function setChannelAccessLevel(
  channelId: string,
  accessLevel: AccessLevel,
  label?: ChannelLabel | null,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('channel_access_levels')
      .upsert({
        channel_id: channelId,
        access_level: accessLevel,
        label: label ?? null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      logError('channelClassification', `Blad ustawiania access level ${channelId}`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    logError('channelClassification', `Blad upsert access level ${channelId}`, (err as Error).message);
    return false;
  }
}
