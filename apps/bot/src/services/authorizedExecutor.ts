// src/services/authorizedExecutor.ts -- executory narzedzi z kontrola dostepu i audytem

import { createToolExecutors } from './toolExecutor.js';
import { isUserInChannel } from './membership.js';
import { canUserAccessChannel, getChannelLabel } from './channelClassification.js';
import { logToolExecution } from './audit.js';
import { searchNotion, buildContextFromNotion, filterNotionResults } from './notion.js';
import type { ToolExecutors, ToolExecutor } from '../types/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Audit wrapper -- loguje kazde wywolanie narzedzia (fire-and-forget)
function withAudit(
  toolName: string,
  userId: string,
  channelId: string,
  threadTs: string,
  executor: ToolExecutor,
): ToolExecutor {
  return async (input: Record<string, unknown>): Promise<string> => {
    const start = Date.now();
    try {
      const result = await executor(input);
      logToolExecution({
        toolName,
        userId,
        channelId,
        toolInput: input,
        resultStatus: 'success',
        resultSummary: result.substring(0, 200),
        durationMs: Date.now() - start,
        threadTs,
      });
      return result;
    } catch (error) {
      logToolExecution({
        toolName,
        userId,
        channelId,
        toolInput: input,
        resultStatus: 'error',
        resultSummary: (error as Error).message,
        durationMs: Date.now() - start,
        threadTs,
      });
      throw error;
    }
  };
}

// Loguj blokade dostepu
function logDenied(
  toolName: string,
  userId: string,
  channelId: string,
  threadTs: string,
  input: Record<string, unknown>,
  reason: string,
): void {
  logToolExecution({
    toolName,
    userId,
    channelId,
    toolInput: input,
    resultStatus: 'denied',
    resultSummary: reason,
    threadTs,
  });
}

// Factory -- tworzy executory z kontrola dostepu i audytem
export function createAuthorizedExecutors(
  app: SlackApp,
  channelId: string,
  threadTs: string,
  userId: string,
): ToolExecutors {
  const baseExecutors = createToolExecutors(app, channelId, threadTs);

  const authorized: ToolExecutors = {};

  for (const [name, executor] of Object.entries(baseExecutors)) {
    if (name === 'send_slack_message') {
      // send_slack_message -- sprawdz membership w kanale docelowym
      authorized[name] = withAudit(name, userId, channelId, threadTs, async (input) => {
        const targetChannel = input.channel as string;

        // Sprawdz czy user ma dostep do kanalu docelowego
        const hasAccess = await canUserAccessChannel(app, userId, channelId, targetChannel);
        if (!hasAccess) {
          logDenied(name, userId, channelId, threadTs, input, `Brak dostepu do kanalu ${targetChannel}`);
          return `Blokada: nie masz dostepu do kanalu ${targetChannel}. Musisz byc czlonkiem kanalu, zeby wysylac tam wiadomosci przez Iwana.`;
        }

        return executor(input);
      });
    } else if (name === 'search_notion') {
      // search_notion -- filtruj restricted databases
      authorized[name] = withAudit(name, userId, channelId, threadTs, async (input) => {
        const pages = await searchNotion(input.query as string);
        const channelLabelValue = await getChannelLabel(channelId);
        const hasLeadershipAccess = channelLabelValue === 'leadership';
        const filtered = filterNotionResults(pages, hasLeadershipAccess);
        return await buildContextFromNotion(filtered);
      });
    } else {
      // Reszta narzedzi -- audit only (juz scoped do biezacego kanalu)
      authorized[name] = withAudit(name, userId, channelId, threadTs, executor);
    }
  }

  return authorized;
}
