// src/services/errors.ts
import { supabase } from './supabase.js';

// Zapisz błąd do Supabase + console.error
export async function logError(source: string, message: string, details: string | null = null): Promise<void> {
  console.error(`[${source}] ${message}`, details || '');

  try {
    await supabase.from('error_logs').insert({
      source,
      message,
      details: details ? String(details) : null,
    });
  } catch (err) {
    console.error('Błąd zapisu do error_logs:', (err as Error).message);
  }
}
