// Testy definicji narzędzi dla Claude tool use
const { getToolDefinitions } = require('../src/services/tools');

describe('getToolDefinitions', () => {
  it('zwraca tablicę 5 narzędzi', () => {
    const tools = getToolDefinitions();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(5);
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

  it('zawiera read_thread, search_slack_history, search_notion, search_workforce, search_calamari', () => {
    const names = getToolDefinitions().map(t => t.name);
    expect(names).toContain('read_thread');
    expect(names).toContain('search_slack_history');
    expect(names).toContain('search_notion');
    expect(names).toContain('search_workforce');
    expect(names).toContain('search_calamari');
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
});
