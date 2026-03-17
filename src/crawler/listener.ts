// src/crawler/listener.ts
import { saveSlackMessage } from './saveMessage.js';
import { getUserName } from '../services/users.js';
import { getChannelName } from '../services/channels.js';
import { isProactiveEnabled } from '../proactive/config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlackApp = any;

// Nasłuchuj WSZYSTKICH wiadomości w kanałach (nie tylko wzmianki)
export function setupCrawler(app: SlackApp): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.message(async ({ message }: any) => {
    // Ignoruj subtypy (edycje, usunięcia etc.)
    if (message.subtype) return;
    // Ignoruj boty
    if (message.bot_id) return;
    // Pobierz nazwy użytkownika i kanału
    const userName = await getUserName(app, message.user);
    const channelName = await getChannelName(app, message.channel);
    await saveSlackMessage({ ...message, user_name: userName, channel_name: channelName });

    // Hook proaktywny — fire-and-forget
    if (isProactiveEnabled()) {
      const { evaluateMessage } = await import('../proactive/engine.js');
      evaluateMessage(app, message, channelName).catch(() => {});
    }
  });
  console.log('📡 Crawler Slack aktywny — zapisuję wiadomości z kanałów');
}
