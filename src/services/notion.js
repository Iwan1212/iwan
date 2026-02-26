// src/services/notion.js — integracja z Notion API
const { Client } = require('@notionhq/client');
const { logError } = require('./errors');

// Inicjalizacja klienta Notion (null gdy brak tokenu)
const notion = process.env.NOTION_TOKEN
  ? new Client({ auth: process.env.NOTION_TOKEN })
  : null;

// Wyszukaj strony w Notion pasujące do zapytania
async function searchNotion(query) {
  if (!notion) return [];

  try {
    const response = await notion.search({
      query,
      filter: { property: 'object', value: 'page' },
      page_size: 3,
    });
    return response.results || [];
  } catch (error) {
    logError('notion', 'Błąd wyszukiwania Notion', error.message);
    return [];
  }
}

// Pobierz tekst ze strony Notion (bloki potomne)
async function getPageText(pageId) {
  if (!notion) return '';

  try {
    const response = await notion.blocks.children.list({ block_id: pageId });
    const blocks = response.results || [];

    const texts = blocks
      .filter(b => b.type === 'paragraph' || b.type === 'heading_1' || b.type === 'heading_2' || b.type === 'heading_3' || b.type === 'bulleted_list_item' || b.type === 'numbered_list_item')
      .map(b => {
        const richText = b[b.type]?.rich_text || [];
        return richText.map(t => t.plain_text).join('');
      })
      .filter(t => t.length > 0);

    return texts.join(' ').substring(0, 500);
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

module.exports = { searchNotion, getPageText, getPageTitle, buildContextFromNotion };
