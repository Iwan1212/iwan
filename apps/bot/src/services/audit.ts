// src/services/audit.ts -- audit trail (fire-and-forget logging do Supabase)

import { supabase } from './supabase.js';
import type { AuditEntry } from '../types/index.js';

// Klucze wrazliwe do ukrycia w logach
const SENSITIVE_KEYS = new Set(['token', 'password', 'secret', 'key', 'api_key', 'apikey', 'authorization']);

// Usun tokeny/hasla z inputu przed zapisem
export function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Fire-and-forget insert do audit_logs (nigdy nie throwuje)
export async function logToolExecution(entry: AuditEntry): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      channel_id: entry.channelId,
      user_id: entry.userId,
      tool_name: entry.toolName,
      tool_input: entry.toolInput ? sanitizeInput(entry.toolInput) : null,
      result_status: entry.resultStatus,
      result_summary: entry.resultSummary?.substring(0, 500) ?? null,
      duration_ms: entry.durationMs ?? null,
      thread_ts: entry.threadTs ?? null,
    });
  } catch (err) {
    // Fire-and-forget — nigdy nie throwuje, tylko loguje do konsoli
    console.error('[audit] Blad zapisu audit log:', (err as Error).message);
  }
}
