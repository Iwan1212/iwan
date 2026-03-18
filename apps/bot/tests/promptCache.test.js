// Testy prompt caching — system prompt z cache_control
const {
  buildCachedSystemPrompt,
  buildCachedToolSystemPrompt,
  STATIC_SYSTEM_PROMPT,
  TOOL_INSTRUCTION,
} = require('../src/services/promptCache');

describe('STATIC_SYSTEM_PROMPT', () => {
  it('zawiera osobowość Gogginsa', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('Goggins');
    expect(STATIC_SYSTEM_PROMPT).toContain('Stay hard');
  });

  it('zawiera styl komunikacji', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('STYL KOMUNIKACJI');
    expect(STATIC_SYSTEM_PROMPT).toContain('po polsku');
  });

  it('zawiera zasady', () => {
    expect(STATIC_SYSTEM_PROMPT).toContain('ZASADY');
    expect(STATIC_SYSTEM_PROMPT).toContain('Momentum');
  });

  it('nie zawiera dynamicznych zmiennych', () => {
    expect(STATIC_SYSTEM_PROMPT).not.toContain('${');
  });
});

describe('TOOL_INSTRUCTION', () => {
  it('zawiera instrukcję o narzędziach', () => {
    expect(TOOL_INSTRUCTION).toContain('narzędzi');
  });
});

describe('buildCachedSystemPrompt', () => {
  it('zwraca array dwóch bloków', () => {
    const blocks = buildCachedSystemPrompt('Jan', '');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks).toHaveLength(2);
  });

  it('pierwszy blok ma cache_control', () => {
    const blocks = buildCachedSystemPrompt('Jan', '');
    expect(blocks[0].type).toBe('text');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('drugi blok nie ma cache_control', () => {
    const blocks = buildCachedSystemPrompt('Jan', '');
    expect(blocks[1].type).toBe('text');
    expect(blocks[1].cache_control).toBeUndefined();
  });

  it('drugi blok zawiera userName i datę', () => {
    const blocks = buildCachedSystemPrompt('Anna', '');
    expect(blocks[1].text).toContain('Anna');
    expect(blocks[1].text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('drugi blok zawiera companyContext', () => {
    const ctx = '\n\nINFORMACJE O FIRMIE:\n[firma]: Momentum';
    const blocks = buildCachedSystemPrompt('Jan', ctx);
    expect(blocks[1].text).toContain('INFORMACJE O FIRMIE');
  });

  it('pierwszy blok nie zawiera instrukcji o narzędziach', () => {
    const blocks = buildCachedSystemPrompt('Jan', '');
    expect(blocks[0].text).not.toContain('Masz dostęp do narzędzi');
  });
});

describe('buildCachedToolSystemPrompt', () => {
  it('zwraca array dwóch bloków', () => {
    const blocks = buildCachedToolSystemPrompt('Jan', '');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks).toHaveLength(2);
  });

  it('pierwszy blok ma cache_control', () => {
    const blocks = buildCachedToolSystemPrompt('Jan', '');
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('pierwszy blok zawiera instrukcję o narzędziach', () => {
    const blocks = buildCachedToolSystemPrompt('Jan', '');
    expect(blocks[0].text).toContain('narzędzi');
  });

  it('drugi blok zawiera userName', () => {
    const blocks = buildCachedToolSystemPrompt('Piotr', '');
    expect(blocks[1].text).toContain('Piotr');
  });
});
