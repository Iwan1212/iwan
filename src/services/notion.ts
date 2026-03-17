// src/services/notion.ts — integracja z Notion API
import { Client } from '@notionhq/client';
import { logError } from './errors.js';

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

// Angielskie stop-words do usunięcia z zapytań
const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
  'they', 'them', 'their', 'its', 'him', 'her', 'us',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'how', 'where', 'when', 'why',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'and', 'but', 'or', 'nor', 'not', 'so', 'if', 'then', 'than',
  'tell', 'show', 'find', 'give', 'get', 'know', 'let', 'say',
  'also', 'just', 'very', 'all', 'any', 'each', 'every', 'some',
  'no', 'yes', 'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPage = any;

// Wyciągnij słowa kluczowe z pytania użytkownika (max 3 dla lepszej trafności)
export function extractKeywords(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[?!.,;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w) && !ENGLISH_STOP_WORDS.has(w));
  return words.slice(0, 3).join(' ');
}

// Wyszukaj strony w Notion (dwa równoległe zapytania dla lepszej trafności)
export async function searchNotion(query: string): Promise<NotionPage[]> {
  if (!notion) return [];

  const keywords = extractKeywords(query);
  console.log(`[notion] Query: "${query}" → keywords: "${keywords}"`);

  if (!keywords) return [];

  try {
    const words = keywords.split(' ');
    const searches: Promise<{ results: NotionPage[] }>[] = [
      notion.search({ query: keywords, filter: { property: 'object', value: 'page' }, page_size: 10 }) as Promise<{ results: NotionPage[] }>,
    ];
    if (words.length > 1) {
      searches.push(
        notion.search({ query: words[0], filter: { property: 'object', value: 'page' }, page_size: 10 }) as Promise<{ results: NotionPage[] }>,
      );
    }

    const responses = await Promise.all(searches);
    const seen = new Set<string>();
    const results: NotionPage[] = [];
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
    logError('notion', 'Błąd wyszukiwania Notion', (error as Error).message);
    return [];
  }
}

// Typy bloków z których wyciągamy tekst
const TEXT_BLOCK_TYPES = new Set([
  'paragraph', 'heading_1', 'heading_2', 'heading_3',
  'bulleted_list_item', 'numbered_list_item',
  'callout', 'quote', 'toggle', 'to_do',
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionBlock = any;

// Wyciągnij tekst z bloku (rich_text)
function getBlockText(block: NotionBlock): string {
  const richText = block[block.type]?.rich_text || [];
  return richText.map((t: { plain_text: string }) => t.plain_text).join('');
}

// Wyciągnij tekst z wiersza tabeli
function getTableRowText(row: NotionBlock): string {
  const cells = row.table_row?.cells || [];
  return cells.map((cell: { plain_text: string }[]) => cell.map(t => t.plain_text).join('')).join(' | ');
}

// Pobierz tekst ze strony Notion (bloki + zagnieżdżone dzieci + tabele)
export async function getPageText(pageId: string): Promise<string> {
  if (!notion) return '';

  try {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    const blocks = response.results || [];
    const texts: string[] = [];

    for (const b of blocks) {
      if (TEXT_BLOCK_TYPES.has((b as NotionBlock).type)) {
        const text = getBlockText(b);
        if (text) texts.push(text);
      }

      if ((b as NotionBlock).has_children) {
        try {
          const children = await notion.blocks.children.list({ block_id: (b as NotionBlock).id, page_size: 50 });
          for (const child of children.results) {
            if ((child as NotionBlock).type === 'table_row') {
              const row = getTableRowText(child);
              if (row) texts.push(row);
            } else if (TEXT_BLOCK_TYPES.has((child as NotionBlock).type)) {
              const text = getBlockText(child);
              if (text) texts.push(text);
            }
          }
        } catch (_) {}
      }

      if (texts.join(' ').length > 1500) break;
    }

    return texts.join(' ').substring(0, 1500);
  } catch (error) {
    logError('notion', 'Błąd pobierania strony', (error as Error).message);
    return '';
  }
}

// Wyciągnij tytuł strony z properties
export function getPageTitle(page: NotionPage): string {
  const props = page.properties || {};
  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop.type === 'title' && prop.title?.length > 0) {
      return prop.title.map((t: { plain_text: string }) => t.plain_text).join('');
    }
  }
  return 'Bez tytułu';
}

// Zbuduj kontekst z wyników Notion (analogicznie do buildContextFromMessages)
export async function buildContextFromNotion(pages: NotionPage[]): Promise<string> {
  if (pages.length === 0) return '';

  const entries: string[] = [];
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
