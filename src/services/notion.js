// src/services/notion.js — integracja z Notion API
const { Client } = require('@notionhq/client');
const { logError } = require('./errors');

// Inicjalizacja klienta Notion (null gdy brak tokenu)
const notion = process.env.NOTION_TOKEN
  ? new Client({ auth: process.env.NOTION_TOKEN })
  : null;

// Polskie stop-words do usunięcia z zapytań
const STOP_WORDS = new Set([
  'a', 'ale', 'ani', 'aż', 'bo', 'by', 'był', 'była', 'było', 'były',
  'co', 'czy', 'dla', 'do', 'gdzie', 'go', 'i', 'ich', 'ile', 'im',
  'ja', 'jak', 'jakie', 'jaki', 'jakim', 'jakiś', 'je', 'jednak',
  'jest', 'jeszcze', 'już', 'kiedy', 'kto', 'która', 'które', 'który',
  'ma', 'mi', 'mnie', 'może', 'mu', 'my', 'na', 'nad', 'nam', 'nas',
  'nie', 'nic', 'niż', 'no', 'o', 'od', 'on', 'ona', 'one', 'oni',
  'ono', 'po', 'pod', 'przy', 'się', 'są', 'ta', 'tak', 'te', 'tego',
  'tej', 'ten', 'to', 'tu', 'tych', 'tylko', 'tym', 'w', 'we', 'was',
  'wam', 'wie', 'więc', 'z', 'za', 'ze', 'że', 'żeby',
  'co', 'było', 'napisane', 'napisano', 'mam', 'dział', 'działu',
  'ostatnim', 'ostatni', 'ostatnia', 'ostatnie',
  'zawiera', 'zawierał', 'zawierała', 'dotyczy', 'dotyczył', 'dotyczą',
  'powiedz', 'opowiedz', 'opisz', 'wyjaśnij', 'znajdź', 'pokaż', 'podaj',
  'wiesz', 'znasz', 'masz', 'możesz', 'powiesz',
  'rok', 'roku', 'miesiąc', 'miesiąca', 'tydzień', 'tygodnia',
  'informacje', 'informacja', 'temat', 'tematu', 'kwestia', 'kwestii',
  'proszę', 'prosze', 'dzięki', 'dzieki', 'hej', 'cześć', 'czesc',
]);

// Wyciągnij słowa kluczowe z pytania użytkownika (max 3 dla lepszej trafności)
function extractKeywords(query) {
  const words = query
    .toLowerCase()
    .replace(/[?!.,;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ');
}

// Wyszukaj strony w Notion (dwa równoległe zapytania dla lepszej trafności)
async function searchNotion(query) {
  if (!notion) return [];

  const keywords = extractKeywords(query);
  console.log(`[notion] Query: "${query}" → keywords: "${keywords}"`);

  if (!keywords) return [];

  try {
    const words = keywords.split(' ');
    const searches = [
      notion.search({ query: keywords, filter: { property: 'object', value: 'page' }, page_size: 10 }),
    ];
    // Drugie zapytanie z pierwszym keyword — Notion API daje lepsze wyniki przy krótszym query
    if (words.length > 1) {
      searches.push(
        notion.search({ query: words[0], filter: { property: 'object', value: 'page' }, page_size: 10 }),
      );
    }

    const responses = await Promise.all(searches);
    const seen = new Set();
    const results = [];
    for (const r of responses) {
      for (const page of (r.results || [])) {
        if (!seen.has(page.id)) {
          seen.add(page.id);
          results.push(page);
        }
      }
    }

    console.log(`[notion] Znaleziono ${results.length} stron`);
    for (const p of results.slice(0, 10)) {
      const title = getPageTitle(p);
      console.log(`[notion]   - "${title}"`);
    }
    return results.slice(0, 10);
  } catch (error) {
    logError('notion', 'Błąd wyszukiwania Notion', error.message);
    return [];
  }
}

// Typy bloków z których wyciągamy tekst
const TEXT_BLOCK_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list_item', 'numbered_list_item',
  'callout', 'quote', 'toggle', 'to_do',
]);

// Wyciągnij tekst z bloku (rich_text)
function getBlockText(block) {
  const richText = block[block.type]?.rich_text || [];
  return richText.map(t => t.plain_text).join('');
}

// Wyciągnij tekst z wiersza tabeli
function getTableRowText(row) {
  const cells = row.table_row?.cells || [];
  return cells.map(cell => cell.map(t => t.plain_text).join('')).join(' | ');
}

// Pobierz tekst ze strony Notion (bloki + zagnieżdżone dzieci + tabele)
async function getPageText(pageId) {
  if (!notion) return '';

  try {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    const blocks = response.results || [];
    const texts = [];

    for (const b of blocks) {
      // Tekst z bloków tekstowych
      if (TEXT_BLOCK_TYPES.has(b.type)) {
        const text = getBlockText(b);
        if (text) texts.push(text);
      }

      // Zagnieżdżone dzieci (tabele, callout z treścią)
      if (b.has_children) {
        try {
          const children = await notion.blocks.children.list({ block_id: b.id, page_size: 50 });
          for (const child of children.results) {
            if (child.type === 'table_row') {
              const row = getTableRowText(child);
              if (row) texts.push(row);
            } else if (TEXT_BLOCK_TYPES.has(child.type)) {
              const text = getBlockText(child);
              if (text) texts.push(text);
            }
          }
        } catch (_) {}
      }

      // Przerwij jeśli mamy dużo tekstu
      if (texts.join(' ').length > 1500) break;
    }

    return texts.join(' ').substring(0, 1500);
  } catch (error) {
    logError('notion', 'Błąd pobierania strony', error.message);
    return '';
  }
}

// Wyciągnij tytuł strony z properties
function getPageTitle(page) {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title?.length > 0) {
      return prop.title.map(t => t.plain_text).join('');
    }
  }
  return 'Bez tytułu';
}

// Zbuduj kontekst z wyników Notion (analogicznie do buildContextFromMessages)
async function buildContextFromNotion(pages) {
  if (pages.length === 0) return '';

  const entries = [];
  for (const page of pages.slice(0, 3)) {
    const title = getPageTitle(page);
    const text = await getPageText(page.id);
    if (text) {
      entries.push(`[${title}]: ${text}`);
    }
  }

  if (entries.length === 0) return '';

  return `\n\nKONTEKST Z NOTION (znalezione strony):\n---\n${entries.join('\n---\n')}\n---\n`;
}

module.exports = { searchNotion, getPageText, getPageTitle, buildContextFromNotion, extractKeywords };
