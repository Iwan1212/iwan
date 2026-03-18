// packages/shared/src/types.ts — wspólne interfejsy projektu Iwan

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  error: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  cache_control?: { type: string };
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>;

export type ToolExecutors = Record<string, ToolExecutor>;

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  attendees: string[];
  organizer: string;
  status: string;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface Employee {
  id?: string | number;
  employee_id?: string | number;
  name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  department?: string;
  assignments?: Assignment[];
  utilization?: Record<string, number | { percentage: number }>;
}

export interface Assignment {
  project_name?: string;
  project?: string;
  allocation_value?: number;
  allocation?: number;
  percentage?: number;
  start_date?: string;
  end_date?: string;
}

export interface Absence {
  employeeEmail?: string;
  absenceTypeName?: string;
  from: string;
  to: string;
  entitlementAmount?: number;
  status: string;
}

export interface ErrorLog {
  source: string;
  message: string;
  details: string | null;
}

export interface SearchResult {
  user_id?: string;
  user_name?: string;
  message_text: string;
  created_at: string;
  thread_ts?: string;
}

export interface SlackMessage {
  channel: string;
  channel_name?: string | null;
  user: string;
  user_name?: string | null;
  text: string;
  thread_ts?: string | null;
  ts: string;
  bot_id?: string;
  subtype?: string;
}

// Dashboard-specific types

export interface SchedulerJobInfo {
  name: string;
  expression: string;
  lastRun: string | null;
  lastDurationMs: number | null;
  status: 'idle' | 'running' | 'error';
}

export interface CacheStats {
  connected: boolean;
  usedMemory: string;
  keyCount: number;
  connectedClients: number;
  uptimeSeconds: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  redis: boolean;
  jobCount: number;
  version: string;
  timestamp: string;
}
