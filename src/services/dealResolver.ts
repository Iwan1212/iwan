// src/services/dealResolver.js — mapowanie kanałów Slack na deale Pipedrive
const Anthropic = require('@anthropic-ai/sdk');
const { MODEL_HAIKU } = require('./models');
const { searchDeals, getDeal } = require('./pipedrive');
const { supabase } = require('./supabase');
const { logError } = require('./errors');
const { cleanLlmJson, preferOpenDeals } = require('./dealUtils');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
async function getCachedMapping(channelId) {
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
async function saveMappings(dealId, channelId, channelName) {
  try {
    await supabase.from('deal_channel_mappings').upsert({
      deal_id: dealId,
      channel_id: channelId,
      channel_name: channelName || null,
      resolved_at: new Date().toISOString(),
    }, { onConflict: 'deal_id,channel_id' });
  } catch (error) {
    logError('dealResolver', 'Błąd zapisu mappingu', error.message);
  }
}

// Znajdź kanały powiązane z dealem
async function getChannelsForDeal(dealId) {
  try {
    const { data } = await supabase
      .from('deal_channel_mappings')
      .select('channel_id')
      .eq('deal_id', dealId);
    return (data || []).map(r => r.channel_id);
  } catch {
    return [];
  }
}

// Wywołaj Haiku do ekstrakcji JSON
async function llmExtractJson(prompt) {
  const response = await client.messages.create({
    model: MODEL_HAIKU,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  return cleanLlmJson(response.content[0].text);
}

// Disambiguacja: LLM wybiera najlepszy deal z kandydatów
async function disambiguate(channelName, topic, deals, channelId) {
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
        await saveMappings(result.deal_id, channelId, channelName);
        console.log(`[dealResolver] LLM: #${channelName} → deal '${matched.title}' (${result.confidence})`);
        return matched;
      }
    }
    return null;
  } catch (error) {
    logError('dealResolver', 'Disambiguacja nieudana', error.message);
    return null;
  }
}

// Rozwiąż kanał #sales-* na deal Pipedrive
async function resolveChannelToDeal(channelName, channelId) {
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
async function resolveThreadToDeal(messages, channelName, channelId, threadTs) {
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

  let searchTerm;
  try {
    const extraction = await llmExtractJson(ENTITY_PROMPT.replace('{text}', firstText));
    searchTerm = (extraction.search_term || '').trim();
  } catch (error) {
    logError('dealResolver', 'Ekstrakcja encji nieudana', error.message);
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

module.exports = {
  resolveChannelToDeal,
  resolveThreadToDeal,
  getChannelsForDeal,
  getCachedMapping,
  saveMappings,
  llmExtractJson,
  disambiguate,
};
