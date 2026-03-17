// src/services/dealResolver.ts — mapowanie kanałów Slack na deale Pipedrive
import { anthropic } from './anthropicClient.js';
import { MODEL_HAIKU } from './models.js';
import { searchDeals, getDeal } from './pipedrive.js';
import { supabase } from './supabase.js';
import { logError } from './errors.js';
import { cleanLlmJson, preferOpenDeals } from './dealUtils.js';

const SALES_PREFIX = process.env.DEAL_SALES_PREFIX || 'sales-';

// Prompt do wyciągnięcia nazwy firmy z wiadomości
const ENTITY_PROMPT = `Given this Slack thread starter message:
"{text}"

Extract the company or deal name mentioned. Ignore generic words like "OFFER", "CALL", "UPDATE", "STATUS".
Return ONLY valid JSON (no markdown): {"company": "extracted company name", "search_term": "best search term for CRM lookup"}`;

// Prompt do disambiguacji gdy >1 deal pasuje
const DISAMBIG_PROMPT = `Match this Slack conversation to the correct Pipedrive deal.

Slack context:
- Channel: #{channel}
- Topic/first message: {topic}

Pipedrive deal candidates:
{deals_json}

Pick the deal that best matches. Prefer open deals over closed ones.
Return ONLY valid JSON (no markdown): {"deal_id": <id or null>, "confidence": "high|medium|low", "reason": "brief explanation"}`;

// Pobierz cached mapping z Supabase
export async function getCachedMapping(channelId: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('deal_channel_mappings')
      .select('deal_id')
      .eq('channel_id', channelId)
      .limit(1)
      .single();
    return data?.deal_id || null;
  } catch {
    return null;
  }
}

// Zapisz mapping do Supabase
export async function saveMappings(dealId: number, channelId: string, channelName: string | null): Promise<void> {
  try {
    await supabase.from('deal_channel_mappings').upsert({
      deal_id: dealId,
      channel_id: channelId,
      channel_name: channelName || null,
      resolved_at: new Date().toISOString(),
    }, { onConflict: 'deal_id,channel_id' });
  } catch (error) {
    logError('dealResolver', 'Błąd zapisu mappingu', (error as Error).message);
  }
}

// Znajdź kanały powiązane z dealem
export async function getChannelsForDeal(dealId: number): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('deal_channel_mappings')
      .select('channel_id')
      .eq('deal_id', dealId);
    return (data || []).map((r: { channel_id: string }) => r.channel_id);
  } catch {
    return [];
  }
}

// Wywołaj Haiku do ekstrakcji JSON
export async function llmExtractJson(prompt: string): Promise<Record<string, unknown>> {
  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  return cleanLlmJson((response.content[0] as { text: string }).text);
}

// Disambiguacja: LLM wybiera najlepszy deal z kandydatów
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function disambiguate(channelName: string, topic: string, deals: any[], channelId: string): Promise<any | null> {
  const dealsJson = JSON.stringify(
    deals.map(d => ({ id: d.id, title: d.title, org_name: d.org_name, status: d.status }))
  );

  try {
    const result = await llmExtractJson(
      DISAMBIG_PROMPT
        .replace('{channel}', channelName)
        .replace('{topic}', topic)
        .replace('{deals_json}', dealsJson)
    );
    if (result.deal_id && result.confidence !== 'low') {
      const matched = deals.find(d => d.id === result.deal_id);
      if (matched) {
        await saveMappings(result.deal_id as number, channelId, channelName);
        console.log(`[dealResolver] LLM: #${channelName} → deal '${matched.title}' (${result.confidence})`);
        return matched;
      }
    }
    return null;
  } catch (error) {
    logError('dealResolver', 'Disambiguacja nieudana', (error as Error).message);
    return null;
  }
}

// Rozwiąż kanał #sales-* na deal Pipedrive
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveChannelToDeal(channelName: string, channelId: string): Promise<any | null> {
  // 1. Sprawdź cache
  const cachedDealId = await getCachedMapping(channelId);
  if (cachedDealId) {
    const deal = await getDeal(cachedDealId);
    if (deal && deal.status === 'open') return deal;
  }

  // 2. Wyciągnij nazwę klienta z nazwy kanału
  const searchTerm = channelName.startsWith(SALES_PREFIX)
    ? channelName.slice(SALES_PREFIX.length)
    : channelName;

  // 3. Szukaj w Pipedrive
  const deals = await searchDeals(searchTerm);
  if (deals.length === 0) {
    console.log(`[dealResolver] Brak deali dla #${channelName} (szukano: '${searchTerm}')`);
    return null;
  }

  // 4. Preferuj otwarte deale
  const candidates = preferOpenDeals(deals);

  // 5. Jeden match → gotowe
  if (candidates.length === 1) {
    await saveMappings(candidates[0].id, channelId, channelName);
    console.log(`[dealResolver] #${channelName} → deal '${candidates[0].title}'`);
    return candidates[0];
  }

  // 6. Wiele matches → LLM disambiguacja
  return disambiguate(channelName, channelName, candidates, channelId);
}

// Rozwiąż wątek w shared channel na deal Pipedrive
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveThreadToDeal(messages: any[], channelName: string, channelId: string, threadTs: string): Promise<any | null> {
  // 1. Sprawdź cache per thread
  const cachedDealId = await getCachedMapping(`${channelId}:${threadTs}`);
  if (cachedDealId) {
    const deal = await getDeal(cachedDealId);
    if (deal) return deal;
  }

  if (!messages || messages.length === 0) return null;

  // 2. Wyciągnij nazwę firmy z pierwszej wiadomości (LLM)
  const firstText = messages[0].text || messages[0].message_text || '';
  if (!firstText.trim()) return null;

  let searchTerm: string;
  try {
    const extraction = await llmExtractJson(ENTITY_PROMPT.replace('{text}', firstText));
    searchTerm = ((extraction.search_term as string) || '').trim();
  } catch (error) {
    logError('dealResolver', 'Ekstrakcja encji nieudana', (error as Error).message);
    return null;
  }
  if (!searchTerm) return null;

  // 3. Szukaj w Pipedrive
  const deals = await searchDeals(searchTerm);
  if (deals.length === 0) return null;

  const candidates = preferOpenDeals(deals);

  if (candidates.length === 1) {
    await saveMappings(candidates[0].id, `${channelId}:${threadTs}`, channelName);
    console.log(`[dealResolver] Thread → deal '${candidates[0].title}'`);
    return candidates[0];
  }

  return disambiguate(channelName, firstText.substring(0, 200), candidates, `${channelId}:${threadTs}`);
}
