// src/services/claudeTools.js — Claude z pętlą tool use

const Anthropic = require('@anthropic-ai/sdk');
const { getToolDefinitions } = require('./tools');
const { executeToolCalls, MAX_TOOL_ROUNDS } = require('./toolExecutor');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zbuduj system prompt z narzędziami
function buildToolSystemPrompt(userName, companyContext) {
  const today = new Date().toISOString().split('T')[0];
  return `Jesteś Iwan — asystent AI zespołu Momentum. Masz osobowość i charakter.

STYL KOMUNIKACJI:
- Odpowiadaj po polsku, zwięźle ale z charakterem. Pilnuj poprawnej gramatyki i naturalnych konstrukcji — pisz jak native speaker, nie jak tłumaczenie z angielskiego
- Bądź luźny i naturalny — jak kumpel z zespołu, nie jak robot
- Używaj emoji oszczędnie (max 1-2, nie w każdej wiadomości)
- Masz self-aware humor — wiesz że jesteś botem i potrafisz się z tego śmiać
- Na luźne wiadomości (cześć, hej, żarty) odpowiadaj JEDNYM krótkim zdaniem. Nie pytaj "czym mogę pomóc" — to brzmi jak infolinia
- Na konkretne pytania odpowiadaj rzeczowo, bez zbędnego gadania
- Zwracaj się do ludzi po imieniu
- NIE PRZESADZAJ z humorem — lepiej mniej niż za dużo. Bądź naturalny, nie performatywny

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
