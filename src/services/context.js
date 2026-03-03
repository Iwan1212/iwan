// src/services/context.js — pobieranie kontekstu firmowego z Supabase
const { supabase } = require('./supabase');
const { logError } = require('./errors');

const contextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

// Mapa tematów → słowa kluczowe wyzwalające dany temat
const TOPIC_KEYWORDS = {
  'struktura-organizacyjna': new Set([
    'kto', 'zespół', 'zespol', 'team', 'szef', 'lider', 'leader',
    'ceo', 'cto', 'coo', 'cfo', 'delivery', 'growth', 'momentum',
    'people', 'osoba', 'pracownik', 'struktura', 'organizacja',
    'dział', 'dzial', 'manager', 'dyrektor', 'head',
  ]),
  'strategia-2026': new Set([
    'strategia', 'strategy', 'cel', 'plan', 'kpi', 'okr',
    'wizja', 'misja', 'roadmap', '2026', 'wzrost', 'revenue',
    'przychód', 'przychod', 'target', 'quarterly', 'kwartał', 'kwartal',
  ]),
  'brand-book': new Set([
    'brand', 'marka', 'logo', 'kolory', 'kolor', 'color', 'font',
    'czcionka', 'styl', 'style', 'design', 'guideline', 'identyfikacja',
    'wizualna', 'branding', 'typografia',
  ]),
  'testimoniale': new Set([
    'opinia', 'opinie', 'referencja', 'referencje', 'klient', 'klienci',
    'feedback', 'case', 'study', 'testimonial', 'review', 'portfolio',
    'projekt', 'realizacja',
  ]),
};

// Dopasuj tematy do zapytania użytkownika (zwraca listę pasujących tematów)
function matchTopics(query) {
  const words = query.toLowerCase().replace(/[?!.,;:()]/g, '').split(/\s+/);
  const matched = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some(w => keywords.has(w))) {
      matched.push(topic);
    }
  }

  // Fallback: pytania o ludzi najczęstsze
  return matched.length > 0 ? matched : ['struktura-organizacyjna'];
}

// Pobierz wszystkie tematy z Supabase (z cache 5 min)
async function getAllTopics() {
  const cacheKey = 'all_topics';
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
      return {};
    }

    const topics = {};
    for (const row of data) {
      topics[row.topic] = row.content;
    }

    contextCache.set(cacheKey, { value: topics, timestamp: Date.now() });
    return topics;
  } catch (err) {
    logError('context', 'Błąd pobierania kontekstu firmowego', err.message);
    return {};
  }
}

// Pobierz kontekst firmowy — selektywnie wg zapytania lub wszystko (backward compatible)
async function getCompanyContext(query = '') {
  const allTopics = await getAllTopics();
  if (Object.keys(allTopics).length === 0) return '';

  let selectedTopics;
  if (!query) {
    // Bez query → zwróć wszystko (backward compatible)
    selectedTopics = Object.keys(allTopics);
  } else {
    selectedTopics = matchTopics(query);
  }

  const entries = selectedTopics
    .filter(t => allTopics[t])
    .map(t => `[${t}]: ${allTopics[t]}`);

  if (entries.length === 0) return '';

  const allKeys = Object.keys(allTopics);
  console.log(`[context] Wybrano ${entries.length}/${allKeys.length} tematów: ${selectedTopics.filter(t => allTopics[t]).join(', ')}`);

  return '\n\nINFORMACJE O FIRMIE:\n' + entries.join('\n');
}

module.exports = { getCompanyContext, matchTopics };
