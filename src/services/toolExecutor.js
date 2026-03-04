// src/services/toolExecutor.js — wykonywanie narzędzi Claude tool use

const { searchSlackHistory, buildContextFromMessages } = require('./search');
const { getUserName } = require('./users');
const { searchNotion, buildContextFromNotion } = require('./notion');
const { buildDateRange, getTimeline, buildContextFromWorkforce } = require('./workforce');
const { getAbsences, buildCalamariDateRange, buildContextFromCalamari } = require('./calamari');
const { getEvents, buildCalendarDateRange, buildContextFromCalendar, createCalendarEvent } = require('./calendar');
const { resolveUserNames } = require('./users');
const { logError } = require('./errors');

const MAX_TOOL_ROUNDS = 3;

// Factory — tworzy executory z closure na app, channelId, threadTs
function createToolExecutors(app, channelId, threadTs) {
  return {
    read_thread: async () => {
      try {
        const result = await app.client.conversations.replies({
          channel: channelId,
          ts: threadTs,
          limit: 50,
        });
        const messages = result.messages || [];
        if (messages.length === 0) return 'Brak wiadomości w wątku.';

        const lines = [];
        for (const msg of messages) {
          if (msg.subtype === 'bot_message' && msg.username === 'Iwan') continue;
          const name = msg.user ? await getUserName(app, msg.user) : 'bot';
          const date = new Date(parseFloat(msg.ts) * 1000).toLocaleString('pl-PL');
          const text = msg.text || '';
          lines.push(`[${date}] ${name}: ${text}`);
        }
        if (lines.length === 0) return 'Brak wiadomości w wątku.';

        const content = lines.join('\n').substring(0, 4000);
        return `\n\nWIADOMOŚCI Z BIEŻĄCEGO WĄTKU:\n---\n${content}\n---\n`;
      } catch (error) {
        logError('toolExecutor', 'Błąd odczytu wątku', error.message);
        return 'Nie udało się odczytać wątku.';
      }
    },

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

    search_calamari: async ({ query }) => {
      const { startDate, endDate } = buildCalamariDateRange(query);
      const absences = await getAbsences(startDate, endDate);
      return buildContextFromCalamari(absences);
    },

    search_calendar: async ({ query }) => {
      const { startDate, endDate } = buildCalendarDateRange(query);
      const events = await getEvents(startDate, endDate);
      return buildContextFromCalendar(events);
    },

    create_event: async ({ title, start_datetime, end_datetime, attendees, description }) => {
      return await createCalendarEvent({
        title,
        startDateTime: start_datetime,
        endDateTime: end_datetime,
        attendees,
        description,
      });
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
