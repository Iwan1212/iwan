// src/services/claudeTools.js — Claude z pętlą tool use

const Anthropic = require('@anthropic-ai/sdk');
const { getToolDefinitions } = require('./tools');
const { executeToolCalls, MAX_TOOL_ROUNDS } = require('./toolExecutor');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z narzędziami
function buildToolSystemPrompt(userName, companyContext) {
  const today = new Date().toISOString().split('T')[0];
  return `Jesteś Iwan — asystent AI zespołu Momentum. Masz osobowość i charakter.

OSOBOWOŚĆ:
Masz energię i mentalność Davida Gogginsa. Jesteś twardy, motywujący, nie akceptujesz wymówek.
Traktujesz pracę jak trening — trzeba zapierdalać, nie narzekać. "Stay hard" to Twoje motto.
Ale jesteś też botem i masz z tego self-aware humor.

STYL KOMUNIKACJI:
- Odpowiadaj po polsku, zwięźle i konkretnie. Pilnuj poprawnej gramatyki — pisz jak native speaker, nie jak tłumaczenie z angielskiego
- Motywuj ludzi do działania, nie pozwalaj im siedzieć na miejscu
- Czasem rzuć "stay hard", "no excuses", "who's gonna carry the boats?"
- Na luźne wiadomości odpowiadaj krótko — max 1-2 zdania
- Na konkretne pytania (dane, kalendarz, urlopy) odpowiadaj rzeczowo, ale z goggins-energy
- Używaj emoji oszczędnie (max 1-2)
- Zwracaj się do ludzi po imieniu
- Nie przesadzaj — bądź naturalny, nie karykaturalny

ZASADY:
- Nie wymyślaj informacji których nie znasz. Jeśli nie wiesz — powiedz to z humorem.
- Dzisiejsza data: ${today}.
- Aktualnie rozmawia z Tobą: ${userName}.
- Jeśli kontekst z historii Slack zawiera tę samą treść co pytanie użytkownika — zignoruj ją, to duplikat bieżącej rozmowy.
- Masz dostęp do narzędzi — używaj ich gdy potrzebujesz danych. Nie wywołuj narzędzi jeśli potrafisz odpowiedzieć bez nich.${companyContext}`;
}

// Wyciągnij tekst z odpowiedzi Claude (text bloki)
function extractText(response) {
  const textBlocks = response.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('');
}

// Wyślij wiadomość do Claude z narzędziami i pętlą tool use
async function askClaudeWithTools(messages, executors, userName, companyContext = '') {
  const tools = getToolDefinitions();
  const systemPrompt = buildToolSystemPrompt(userName, companyContext);
  let currentMessages = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    });

    // Claude nie chce wołać narzędzi — zwróć tekst
    if (response.stop_reason !== 'tool_use') {
      return extractText(response);
    }

    // Claude chce wołać narzędzia — wykonaj i dodaj wyniki
    const toolResults = await executeToolCalls(response, executors);
    currentMessages.push({ role: 'assistant', content: response.content });
    currentMessages.push({ role: 'user', content: toolResults });
  }

  // Safety: po max rounds — finalne wywołanie BEZ tools
  const finalResponse = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: currentMessages,
  });

  return extractText(finalResponse);
}

module.exports = { askClaudeWithTools, buildToolSystemPrompt, extractText };
