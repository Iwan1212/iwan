// Testy ładowania plików wiedzy
jest.mock('../src/services/supabase', () => ({ supabase: {} }));
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));

const fs = require('fs');
const path = require('path');

// Mock fs do kontroli testów
jest.mock('fs');

const { loadAllKnowledge, loadKnowledgeFile, clearKnowledgeCache } = require('../src/services/knowledge');

beforeEach(() => {
  clearKnowledgeCache();
  jest.clearAllMocks();
});

describe('loadAllKnowledge', () => {
  it('ładuje i łączy pliki .md z katalogu knowledge/', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['company.md', 'sales-process.md']);
    fs.readFileSync
      .mockReturnValueOnce('# Company\nWe are Acme.')
      .mockReturnValueOnce('# Sales\nStep 1: Lead.');

    const result = loadAllKnowledge();
    expect(result).toContain('# Company');
    expect(result).toContain('# Sales');
    expect(result).toContain('---');
  });

  it('zwraca pusty string gdy brak katalogu', () => {
    fs.existsSync.mockReturnValue(false);
    expect(loadAllKnowledge()).toBe('');
  });

  it('cachuje wynik po pierwszym wywołaniu', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['test.md']);
    fs.readFileSync.mockReturnValue('content');

    loadAllKnowledge();
    loadAllKnowledge();
    // readdirSync powinien być wywołany tylko raz
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
  });

  it('pomija puste pliki', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['empty.md', 'content.md']);
    fs.readFileSync
      .mockReturnValueOnce('')
      .mockReturnValueOnce('Real content');

    const result = loadAllKnowledge();
    expect(result).toBe('Real content');
  });

  it('filtruje nie-.md pliki', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['readme.txt', 'notes.md', 'config.json']);
    fs.readFileSync.mockReturnValue('Notes content');

    const result = loadAllKnowledge();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toBe('Notes content');
  });
});

describe('loadKnowledgeFile', () => {
  it('ładuje konkretny plik po nazwie', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('Bot persona content');

    const result = loadKnowledgeFile('bot-persona');
    expect(result).toBe('Bot persona content');
  });

  it('zwraca pusty string gdy plik nie istnieje', () => {
    fs.existsSync.mockReturnValue(false);
    expect(loadKnowledgeFile('nonexistent')).toBe('');
  });

  it('cachuje wynik', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('cached');

    loadKnowledgeFile('test');
    loadKnowledgeFile('test');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('clearKnowledgeCache', () => {
  it('czyści cache', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('content');

    loadKnowledgeFile('test');
    clearKnowledgeCache();
    loadKnowledgeFile('test');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });
});
