// Testy wykrywania tematów (keyword match)
const { detectTopics } = require('../src/proactive/topicDetector');

describe('detectTopics', () => {
  it('wykrywa temat dostępności', () => {
    expect(detectTopics('kto jest dostępny?')).toContain('dostepnosc');
    expect(detectTopics('kto jest wolny na ten tydzień?')).toContain('dostepnosc');
  });

  it('wykrywa temat urlopów', () => {
    expect(detectTopics('kto jest na urlopie?')).toContain('urlopy');
    expect(detectTopics('kiedy mam urlop?')).toContain('urlopy');
    expect(detectTopics('kto jest nieobecny?')).toContain('urlopy');
  });

  it('wykrywa temat deadline', () => {
    expect(detectTopics('kiedy jest deadline?')).toContain('deadline');
    expect(detectTopics('to jest pilne!')).toContain('deadline');
    expect(detectTopics('do kiedy musimy to zrobić?')).toContain('deadline');
  });

  it('wykrywa temat procesów', () => {
    expect(detectTopics('jaki jest proces onboardingu?')).toContain('procesy');
    expect(detectTopics('jak zgłosić urlop?')).toContain('procesy');
  });

  it('wykrywa temat spotkań', () => {
    expect(detectTopics('kiedy jest następne spotkanie?')).toContain('spotkania');
    expect(detectTopics('o czym był standup?')).toContain('spotkania');
    expect(detectTopics('kiedy mamy weekly?')).toContain('spotkania');
  });

  it('wykrywa wiele tematów naraz', () => {
    const topics = detectTopics('kto jest na urlopie i kiedy jest deadline?');
    expect(topics).toContain('urlopy');
    expect(topics).toContain('deadline');
  });

  it('zwraca pustą tablicę dla nieistotnego tekstu', () => {
    expect(detectTopics('fajny mem xD')).toEqual([]);
    expect(detectTopics('cześć, jak tam?')).toEqual([]);
  });

  it('zwraca pustą tablicę dla pustego tekstu', () => {
    expect(detectTopics('')).toEqual([]);
    expect(detectTopics(null)).toEqual([]);
    expect(detectTopics(undefined)).toEqual([]);
  });

  it('jest case-insensitive', () => {
    expect(detectTopics('DEADLINE')).toContain('deadline');
    expect(detectTopics('Urlop')).toContain('urlopy');
  });
});
