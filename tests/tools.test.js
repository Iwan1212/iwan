// Testy definicji narzędzi dla Claude tool use
const { getToolDefinitions, getToolDefinitionsWithCache } = require('../src/services/tools');

describe('getToolDefinitions', () => {
  it('zwraca tablicę 7 narzędzi', () => {
    const tools = getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(10);
  });

  it('każde narzędzie ma wymagane pola Anthropic API', () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('zawiera read_thread, search_slack_history, search_notion, search_workforce, search_calamari, search_calendar, create_event', () => {
    const names = getToolDefinitions().map(t => t.name);
    expect(names).toContain('read_thread');
    expect(names).toContain('read_channel');
    expect(names).toContain('search_slack_history');
    expect(names).toContain('search_notion');
    expect(names).toContain('search_workforce');
    expect(names).toContain('search_calamari');
    expect(names).toContain('search_calendar');
    expect(names).toContain('create_event');
    expect(names).toContain('search_pipedrive');
    expect(names).toContain('deal_status');
  });

  it('read_thread nie wymaga parametrów', () => {
    const readThread = getToolDefinitions().find(t => t.name === 'read_thread');
    expect(readThread.input_schema.required).toEqual([]);
  });

  it('nie zawiera channelId ani threadTs w schemacie', () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      const props = Object.keys(tool.input_schema.properties);
      expect(props).not.toContain('channelId');
      expect(props).not.toContain('threadTs');
    }
  });

  it('create_event wymaga title, start_datetime, end_datetime', () => {
    const createEvent = getToolDefinitions().find(t => t.name === 'create_event');
    expect(createEvent.input_schema.required).toEqual(['title', 'start_datetime', 'end_datetime']);
    expect(createEvent.input_schema.properties).toHaveProperty('attendees');
    expect(createEvent.input_schema.properties).toHaveProperty('description');
  });
});

describe('getToolDefinitionsWithCache', () => {
  it('zwraca tablicę 8 narzędzi', () => {
    const tools = getToolDefinitionsWithCache();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(10);
  });

  it('ostatnie narzędzie ma cache_control', () => {
    const tools = getToolDefinitionsWithCache();
    const last = tools[tools.length - 1];
    expect(last.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('pozostałe narzędzia nie mają cache_control', () => {
    const tools = getToolDefinitionsWithCache();
    for (const tool of tools.slice(0, -1)) {
      expect(tool.cache_control).toBeUndefined();
    }
  });

  it('nie modyfikuje oryginalnych definicji', () => {
    getToolDefinitionsWithCache();
    const original = getToolDefinitions();
    const last = original[original.length - 1];
    expect(last.cache_control).toBeUndefined();
  });

  it('zachowuje wszystkie pola ostatniego narzędzia', () => {
    const tools = getToolDefinitionsWithCache();
    const last = tools[tools.length - 1];
    expect(last).toHaveProperty('name', 'create_event');
    expect(last).toHaveProperty('description');
    expect(last).toHaveProperty('input_schema');
  });
});
