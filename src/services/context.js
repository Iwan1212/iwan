// src/services/context.js — pobieranie kontekstu firmowego z Supabase
const { supabase } = require('./supabase');
const { logError } = require('./errors');

const contextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

// Pobierz kontekst firmowy z Supabase (z cache 5 min)
async function getCompanyContext() {
  const cacheKey = 'company_context';
  const cached = contextCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const { data, error } = await supabase
      .from('company_context')
      .select('topic, content');

    if (error) throw error;
    if (!data || data.length === 0) {
      console.log('[context] Brak wpisów w company_context');
      return '';
    }

    console.log(`[context] Pobrano ${data.length} wpisów z company_context (${data.map(r => r.topic).join(', ')})`);
    const formatted = '\n\nINFORMACJE O FIRMIE:\n' +
      data.map(row => `[${row.topic}]: ${row.content}`).join('\n');

    contextCache.set(cacheKey, { value: formatted, timestamp: Date.now() });
    return formatted;
  } catch (err) {
    logError('context', 'Błąd pobierania kontekstu firmowego', err.message);
    return '';
  }
}

module.exports = { getCompanyContext };
