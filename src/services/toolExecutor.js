// src/services/toolExecutor.js — wykonywanie narzędzi Claude tool use

const { searchSlackHistory, buildContextFromMessages } = require('./search');
const { searchNotion, buildContextFromNotion } = require('./notion');
const { buildDateRange, getTimeline, buildContextFromWorkforce } = require('./workforce');
const { resolveUserNames } = require('./users');
const { logError } = require('./errors');

const MAX_TOOL_ROUNDS = 3;

// Factory — tworzy executory z closure na app, channelId, threadTs
function createToolExecutors(app, channelId, threadTs) {
  return {
    search_slack_history: async ({ query }) => {
      const results = await searchSlackHistory(query, channelId, threadTs);
      await resolveUserNames(app, results);
      return buildContextFromMessages(results);
    },

    search_notion: async ({ query }) => {
      const pages = await searchNotion(query);
      return await buildContextFromNotion(pages);
    },

    search_workforce: async ({ query }) => {
      const { startDate, endDate } = buildDateRange(query);
      const data = await getTimeline(startDate, endDate);
      return buildContextFromWorkforce(data);
    },
  };
}

// Wykonaj tool_use bloki z odpowiedzi Claude (równolegle)
async function executeToolCalls(response, executors) {
  const toolBlocks = response.content.filter(b => b.type === 'tool_use');
  if (toolBlocks.length === 0) return [];

  const results = await Promise.all(
    toolBlocks.map(async (block) => {
      const executor = executors[block.name];
      if (!executor) {
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Nieznane narzędzie: ${block.name}`,
          is_error: true,
        };
      }

      try {
        const result = await executor(block.input);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: result || 'Brak wyników.',
        };
      } catch (error) {
        logError('toolExecutor', `Błąd narzędzia ${block.name}`, error.message);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Błąd: ${error.message}`,
          is_error: true,
        };
      }
    })
  );

  return results;
}

module.exports = { createToolExecutors, executeToolCalls, MAX_TOOL_ROUNDS };
