// src/services/context.ts — pobieranie kontekstu firmowego z Supabase
import { supabase } from './supabase.js';
import { logError } from './errors.js';

const contextCache = new Map<string, { value: Record<string, string>; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

// Mapa tematów → słowa kluczowe wyzwalające dany temat
const TOPIC_KEYWORDS: Record<string, Set<string>> = {
  'struktura-organizacyjna': new Set([
    'kto', 'zespół', 'zespol', 'zespole', 'zespołu', 'team',
    'szef', 'szefa', 'lider', 'lidera', 'leader',
    'ceo', 'cto', 'coo', 'cfo', 'delivery', 'growth', 'momentum',
    'people', 'osoba', 'osoby', 'pracownik', 'pracownicy',
    'struktura', 'struktury', 'organizacja', 'organizacji',
    'dział', 'dzial', 'działu', 'dzialy', 'manager', 'dyrektor', 'head',
  ]),
  'strategia-2026': new Set([
    'strategia', 'strategii', 'strategię', 'strategie', 'strategy',
    'cel', 'cele', 'plan', 'kpi', 'okr',
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
    'feedback', 'case', 'study', 'testimonial', 'testimoniale', 'testimoniali',
    'review', 'portfolio', 'projekt', 'realizacja',
  ]),
};

// Dopasuj tematy do zapytania użytkownika (zwraca listę pasujących tematów)
export function matchTopics(query: string): string[] {
  const words = query.toLowerCase().replace(/[?!.,;:()]/g, '').split(/\s+/);
  const matched: string[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (words.some(w => keywords.has(w))) {
      matched.push(topic);
    }
  }

  return matched.length > 0 ? matched : ['struktura-organizacyjna'];
}

// Pobierz wszystkie tematy z Supabase (z cache 5 min)
async function getAllTopics(): Promise<Record<string, string>> {
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

    const topics: Record<string, string> = {};
    for (const row of data) {
      topics[row.topic] = row.content;
    }

    contextCache.set(cacheKey, { value: topics, timestamp: Date.now() });
    return topics;
  } catch (err) {
    logError('context', 'Błąd pobierania kontekstu firmowego', (err as Error).message);
    return {};
  }
}

// Pobierz kontekst firmowy — selektywnie wg zapytania lub wszystko (backward compatible)
export async function getCompanyContext(query = ''): Promise<string> {
  const allTopics = await getAllTopics();
  if (Object.keys(allTopics).length === 0) return '';

  let selectedTopics: string[];
  if (!query) {
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
