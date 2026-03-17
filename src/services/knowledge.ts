// src/services/knowledge.ts — ładowanie plików wiedzy z knowledge/*.md
import fs from 'fs';
import path from 'path';
import { logError } from './errors.js';

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

// Cache załadowanych plików (ładujemy raz przy starcie)
const cache = new Map<string, string>();

// Załaduj wszystkie pliki .md z katalogu knowledge/
export function loadAllKnowledge(): string {
  if (cache.has('_all')) return cache.get('_all')!;

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.log('[knowledge] Brak katalogu knowledge/ — pomijam');
    cache.set('_all', '');
    return '';
  }

  try {
    const files = fs.readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md'))
      .sort();

    const parts: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8').trim();
      if (content) {
        parts.push(content);
        console.log(`[knowledge] Załadowano: ${file}`);
      }
    }

    const result = parts.join('\n\n---\n\n');
    cache.set('_all', result);
    return result;
  } catch (error) {
    logError('knowledge', 'Błąd ładowania plików wiedzy', (error as Error).message);
    cache.set('_all', '');
    return '';
  }
}

// Załaduj konkretny plik po nazwie (np. 'bot-persona' → knowledge/bot-persona.md)
export function loadKnowledgeFile(name: string): string {
  if (cache.has(name)) return cache.get(name)!;

  const filePath = path.join(KNOWLEDGE_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    cache.set(name, '');
    return '';
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    cache.set(name, content);
    return content;
  } catch (error) {
    logError('knowledge', `Błąd ładowania ${name}.md`, (error as Error).message);
    cache.set(name, '');
    return '';
  }
}

// Wyczyść cache (do testów / hot-reload)
export function clearKnowledgeCache(): void {
  cache.clear();
}
