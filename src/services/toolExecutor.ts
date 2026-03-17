// src/services/toolExecutor.ts — wykonywanie narzędzi Claude tool use

import { searchSlackHistory, buildContextFromMessages } from './search.js';
import { getUserName } from './users.js';
import { searchNotion, buildContextFromNotion } from './notion.js';
import { buildDateRange, getTimeline, buildContextFromWorkforce } from './workforce.js';
import { getAbsences, buildCalamariDateRange, buildContextFromCalamari } from './calamari.js';
import { getEvents, buildCalendarDateRange, buildContextFromCalendar, createCalendarEvent } from './calendar.js';
import { searchDeals, getDeal, getDealNotes, buildContextFromDeal, buildContextFromDeals } from './pipedrive.js';
import { resolveUserNames } from './users.js';
import { logError } from './errors.js';
import type { ToolExecutors, ToolResult } from '../types/index.js';

export const MAX_TOOL_ROUNDS = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ContentBlock {
  type: string;
}

interface MessageResponse {
  content: ContentBlock[];
}

// Factory — tworzy executory z closure na app, channelId, threadTs
export function createToolExecutors(app: SlackApp, channelId: string, threadTs: string): ToolExecutors {
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

        const lines: string[] = [];
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
        logError('toolExecutor', 'Błąd odczytu wątku', (error as Error).message);
        return 'Nie udało się odczytać wątku.';
      }
    },

    read_channel: async ({ count } = {}) => {
      try {
        const target = Math.min((count as number) || 200, 500);
        const allMessages: Record<string, unknown>[] = [];
        let cursor: string | undefined;

        // Paginacja — pobierz do target wiadomości
        while (allMessages.length < target) {
          const batch = Math.min(200, target - allMessages.length);
          const result = await app.client.conversations.history({
            channel: channelId,
            limit: batch,
            ...(cursor ? { cursor } : {}),
          });
          const msgs = result.messages || [];
          allMessages.push(...msgs);
          if (!result.has_more || msgs.length === 0) break;
          cursor = result.response_metadata?.next_cursor;
        }

        if (allMessages.length === 0) return 'Brak wiadomości na kanale.';

        const lines: string[] = [];
        for (const msg of allMessages.reverse()) {
          const name = (msg as Record<string, unknown>).user ? await getUserName(app, (msg as Record<string, unknown>).user as string) : ((msg as Record<string, unknown>).username as string || 'bot');
          const date = new Date(parseFloat((msg as Record<string, unknown>).ts as string) * 1000).toLocaleString('pl-PL');
          const text = ((msg as Record<string, unknown>).text as string) || '';
          lines.push(`[${date}] ${name}: ${text}`);
        }
        if (lines.length === 0) return 'Brak wiadomości na kanale.';

        const content = lines.join('\n').substring(0, 8000);
        return `\n\nOSTATNIE WIADOMOŚCI Z KANAŁU (${lines.length}):\n---\n${content}\n---\n`;
      } catch (error) {
        logError('toolExecutor', 'Błąd odczytu kanału', (error as Error).message);
        return 'Nie udało się odczytać kanału.';
      }
    },

    search_slack_history: async ({ query }) => {
      const results = await searchSlackHistory(query as string, channelId, threadTs);
      await resolveUserNames(app, results);
      return buildContextFromMessages(results);
    },

    search_notion: async ({ query }) => {
      const pages = await searchNotion(query as string);
      return await buildContextFromNotion(pages);
    },

    search_workforce: async ({ query }) => {
      const { startDate, endDate } = buildDateRange(query as string);
      const data = await getTimeline(startDate, endDate);
      return buildContextFromWorkforce(data);
    },

    search_calamari: async ({ query }) => {
      const { startDate, endDate } = buildCalamariDateRange(query as string);
      const absences = await getAbsences(startDate, endDate);
      return buildContextFromCalamari(absences);
    },

    search_calendar: async ({ query }) => {
      const { startDate, endDate } = buildCalendarDateRange(query as string);
      const events = await getEvents(startDate, endDate);
      console.log(`[calendar] Query: "${query}" → ${startDate} - ${endDate} → ${events.length} wydarzeń`);
      return buildContextFromCalendar(events);
    },

    create_event: async ({ title, start_datetime, end_datetime, attendees, description }) => {
      return await createCalendarEvent({
        title: title as string,
        startDateTime: start_datetime as string,
        endDateTime: end_datetime as string,
        attendees: attendees as string[] | undefined,
        description: description as string | undefined,
      });
    },

    search_pipedrive: async ({ query }) => {
      const deals = await searchDeals(query as string);
      return buildContextFromDeals(deals);
    },

    deal_status: async ({ deal_id }) => {
      const deal = await getDeal(deal_id as number);
      if (!deal) return 'Nie znaleziono deala o podanym ID.';
      const notes = await getDealNotes(deal_id as number);
      return buildContextFromDeal(deal, notes);
    },
  };
}

// Wykonaj tool_use bloki z odpowiedzi Claude (równolegle)
export async function executeToolCalls(response: MessageResponse, executors: ToolExecutors): Promise<ToolResult[]> {
  const toolBlocks = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
  if (toolBlocks.length === 0) return [];

  const results = await Promise.all(
    toolBlocks.map(async (block): Promise<ToolResult> => {
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
        logError('toolExecutor', `Błąd narzędzia ${block.name}`, (error as Error).message);
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Błąd: ${(error as Error).message}`,
          is_error: true,
        };
      }
    })
  );

  return results;
}
