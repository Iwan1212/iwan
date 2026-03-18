// src/services/claude.ts
import { ask } from './llm.js';
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
  return await ask({
    tier: 'smart',
    maxTokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages: [{ role: 'user', content: userMessage }],
  });
}

// Wyślij wiadomość do Claude z historią rozmowy
export async function askClaudeWithHistory(messages: ChatMessage[], userName: string, companyContext = ''): Promise<string> {
  return await ask({
    tier: 'smart',
    maxTokens: 1024,
    system: buildSystemPrompt(userName, companyContext),
    messages,
  });
}

// Wyślij wiadomość do Claude z kontekstem ze Slacka i historią rozmowy
export async function askClaudeWithContext(messages: ChatMessage[], slackContext: string, userName: string, companyContext = ''): Promise<string> {
  const systemWithContext = buildSystemPrompt(userName, companyContext) + slackContext;
  return await ask({
    tier: 'smart',
    maxTokens: 1024,
    system: systemWithContext,
    messages,
  });
}
