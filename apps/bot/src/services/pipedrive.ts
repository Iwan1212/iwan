// src/services/pipedrive.ts — integracja z Pipedrive CRM API
import { logError } from './errors.js';
import { withCache, invalidateCache, CACHE_TTL } from './cache.js';

const PIPEDRIVE_API_TOKEN = process.env.PIPEDRIVE_API_TOKEN || '';
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN || '';
const BASE_URL = 'https://api.pipedrive.com/v1';
const RATE_LIMIT_MS = 600;

let lastRequestTime = 0;

// Sprawdź czy integracja Pipedrive jest skonfigurowana
export function isPipedriveEnabled(): boolean {
  return Boolean(PIPEDRIVE_API_TOKEN);
}

// Odczekaj rate limit (~100 req/min)
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Wykonaj zapytanie do Pipedrive API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pipedriveRequest(method: string, endpoint: string, params: Record<string, any> = {}, body: Record<string, unknown> | null = null): Promise<any> {
  await rateLimit();
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set('api_token', PIPEDRIVE_API_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const options: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), options);
  if (!res.ok) throw new Error(`Pipedrive ${method} ${endpoint}: ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Pipedrive error: ${data.error || 'unknown'}`);
  return data;
}

// Sprawdź połączenie z Pipedrive
export async function testConnection(): Promise<boolean> {
  if (!isPipedriveEnabled()) return false;
  try {
    const result = await pipedriveRequest('GET', 'users/me');
    const name = result.data?.name || 'unknown';
    console.log(`[pipedrive] Połączono jako: ${name}`);
    return true;
  } catch (error) {
    logError('pipedrive', 'Błąd połączenia', (error as Error).message);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DealSearchResult {
  id: number;
  title: string;
  status: string;
  org_name: string | null;
  owner_name: string | null;
  stage: string | null;
  value: number | null;
  currency: string | null;
}

// Szukaj deali po nazwie (fuzzy matching)
export async function searchDeals(term: string, limit = 5): Promise<DealSearchResult[]> {
  if (!isPipedriveEnabled()) return [];
  return withCache(`pipedrive:search:${term}:${limit}`, CACHE_TTL.PIPEDRIVE_SEARCH, async () => {
    try {
      const result = await pipedriveRequest('GET', 'deals/search', {
        term, limit, fields: 'title',
      });
      const items = result.data?.items || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return items.map((item: any) => {
        const deal = item.item || {};
        return {
          id: deal.id,
          title: deal.title,
          status: deal.status,
          org_name: deal.organization?.name || null,
          owner_name: deal.owner?.name || null,
          stage: deal.stage?.name || null,
          value: deal.value,
          currency: deal.currency,
        };
      });
    } catch (error) {
      logError('pipedrive', 'Błąd wyszukiwania deali', (error as Error).message);
      return [];
    }
  });
}

// Pobierz pojedynczy deal po ID
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDeal(dealId: number): Promise<any> {
  if (!isPipedriveEnabled()) return null;
  return withCache(`pipedrive:deal:${dealId}`, CACHE_TTL.PIPEDRIVE_DEAL, async () => {
    try {
      const result = await pipedriveRequest('GET', `deals/${dealId}`);
      return result.data || null;
    } catch (error) {
      logError('pipedrive', `Błąd pobierania deala ${dealId}`, (error as Error).message);
      return null;
    }
  });
}

// Pobierz aktywne (otwarte) deale, opcjonalnie filtrowane po pipeline
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getActiveDeals(pipelineIds: number[] = []): Promise<any[]> {
  if (!isPipedriveEnabled()) return [];
  const pipelines = pipelineIds.length > 0 ? pipelineIds : [null];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allDeals: any[] = [];

  try {
    for (const pid of pipelines) {
      let start = 0;
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params: any = { status: 'open', start, limit: 100 };
        if (pid) params.pipeline_id = pid;
        const result = await pipedriveRequest('GET', 'deals', params);
        const deals = result.data || [];
        if (deals.length === 0) break;
        allDeals.push(...deals);
        const pagination = result.additional_data?.pagination || {};
        if (!pagination.more_items_in_collection) break;
        start = pagination.next_start || start + 100;
      }
    }
    console.log(`[pipedrive] Pobrano ${allDeals.length} aktywnych deali`);
    return allDeals;
  } catch (error) {
    logError('pipedrive', 'Błąd pobierania aktywnych deali', (error as Error).message);
    return [];
  }
}

// Pobierz notatki deala
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDealNotes(dealId: number, limit = 50): Promise<any[]> {
  if (!isPipedriveEnabled()) return [];
  return withCache(`pipedrive:notes:${dealId}:${limit}`, CACHE_TTL.PIPEDRIVE_NOTES, async () => {
    try {
      const result = await pipedriveRequest('GET', `deals/${dealId}/notes`, {
        sort: 'update_time DESC', limit,
      });
      return result.data || [];
    } catch (error) {
      logError('pipedrive', `Błąd pobierania notatek deala ${dealId}`, (error as Error).message);
      return [];
    }
  });
}

// Znajdź ostatnią notatkę agenta po prefixie
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findAgentNote(notes: any[], prefix = '[Slack Summary]'): any | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return notes.find((n: any) => (n.content || '').includes(prefix)) || null;
}

// Utwórz notatkę na dealu (content = HTML)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createNote(dealId: number, content: string, pinned = false): Promise<any> {
  if (!isPipedriveEnabled()) return null;
  try {
    const result = await pipedriveRequest('POST', 'notes', {}, {
      deal_id: dealId,
      content,
      pinned_to_deal_flag: pinned ? 1 : 0,
    });
    const noteId = result.data?.id;
    console.log(`[pipedrive] Utworzono notatkę na dealu ${dealId} (note_id=${noteId})`);
    await invalidateCache(`pipedrive:notes:${dealId}:*`);
    return result.data || null;
  } catch (error) {
    logError('pipedrive', `Błąd tworzenia notatki na dealu ${dealId}`, (error as Error).message);
    return null;
  }
}

// Zaktualizuj istniejącą notatkę
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateNote(noteId: number, content: string): Promise<any> {
  if (!isPipedriveEnabled()) return null;
  try {
    const result = await pipedriveRequest('PUT', `notes/${noteId}`, {}, { content });
    console.log(`[pipedrive] Zaktualizowano notatkę ${noteId}`);
    await invalidateCache('pipedrive:notes:*');
    return result.data || null;
  } catch (error) {
    logError('pipedrive', `Błąd aktualizacji notatki ${noteId}`, (error as Error).message);
    return null;
  }
}

// Utwórz aktywność (task) powiązaną z dealem
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createActivity(dealId: number, subject: string, type = 'task', dueDate: string | null = null): Promise<any> {
  if (!isPipedriveEnabled()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { deal_id: dealId, subject, type, done: 0 };
    if (dueDate) body.due_date = dueDate;
    const result = await pipedriveRequest('POST', 'activities', {}, body);
    console.log(`[pipedrive] Utworzono aktywność na dealu ${dealId}: ${subject}`);
    await invalidateCache(`pipedrive:deal:${dealId}`);
    return result.data || null;
  } catch (error) {
    logError('pipedrive', `Błąd tworzenia aktywności na dealu ${dealId}`, (error as Error).message);
    return null;
  }
}

// Zbuduj kontekst z danych Pipedrive dla Claude
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildContextFromDeal(deal: any, notes: any[] = []): string {
  if (!deal) return '';

  const lines: string[] = [];
  lines.push(`DEAL: ${deal.title || '?'}`);
  lines.push(`Status: ${deal.status || '?'}`);
  if (deal.stage_id) lines.push(`Stage ID: ${deal.stage_id}`);
  lines.push(`Wartość: ${deal.value || '?'} ${deal.currency || ''}`);

  const ownerName = deal.owner_name || deal.user_id?.name || '?';
  lines.push(`Owner: ${ownerName}`);

  const orgName = deal.org_name || deal.org_id?.name || null;
  if (orgName) lines.push(`Organizacja: ${orgName}`);

  if (notes.length > 0) {
    lines.push('');
    lines.push('OSTATNIE NOTATKI:');
    for (const note of notes.slice(0, 3)) {
      const content = (note.content || '').replace(/<[^>]+>/g, ' ').trim();
      const truncated = content.length > 300 ? content.substring(0, 300) + '...' : content;
      lines.push(`  - ${truncated}`);
    }
  }

  const text = lines.join('\n').substring(0, 4000);
  return `\n\nKONTEKST Z PIPEDRIVE CRM:\n---\n${text}\n---\n`;
}

// Zbuduj kontekst z wyników wyszukiwania deali
export function buildContextFromDeals(deals: DealSearchResult[]): string {
  if (!deals || deals.length === 0) return 'Nie znaleziono deali.';

  const lines = deals.map(d => {
    const parts = [`${d.title} (ID: ${d.id})`];
    if (d.status) parts.push(`status: ${d.status}`);
    if (d.stage) parts.push(`stage: ${d.stage}`);
    if (d.value) parts.push(`wartość: ${d.value} ${d.currency || ''}`);
    if (d.owner_name) parts.push(`owner: ${d.owner_name}`);
    if (d.org_name) parts.push(`org: ${d.org_name}`);
    return parts.join(', ');
  });

  const text = lines.join('\n').substring(0, 4000);
  return `\n\nWYNIKI Z PIPEDRIVE CRM:\n---\n${text}\n---\n`;
}
