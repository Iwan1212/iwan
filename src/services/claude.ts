// src/services/claude.ts
import { anthropic } from './anthropicClient.js';
import { MODEL_SONNET } from './models.js';
import { STATIC_SYSTEM_PROMPT } from './promptCache.js';
import type { ChatMessage } from '../types/index.js';

// Zbuduj system prompt z imieniem rozmówcy i kontekstem firmowym
function buildSystemPrompt(userName: string, companyContext: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `${STATIC_SYSTEM_PROMPT}
- Dzisiejsza data: ${today}.
- Aktualnie rozmawia z Tobą: ${userName}.${companyContext}`;
}

// Wyślij wiadomość do Claude i zwróć odpowiedź
export async function askClaude(userMessage: string, userName: string, companyContext = ''): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: [{ role: 'user', content: userMessage }],
  });
  return (response.content[0] as { text: string }).text;
}

// Wyślij wiadomość do Claude z historią rozmowy
export async function askClaudeWithHistory(messages: ChatMessage[], userName: string, companyContext = ''): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: messages,
  });
  return (response.content[0] as { text: string }).text;
}

// Wyślij wiadomość do Claude z kontekstem ze Slacka i historią rozmowy
export async function askClaudeWithContext(messages: ChatMessage[], slackContext: string, userName: string, companyContext = ''): Promise<string> {
  const systemWithContext = buildSystemPrompt(userName, companyContext) + slackContext;
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: systemWithContext,
    messages: messages,
  });
  return (response.content[0] as { text: string }).text;
}
