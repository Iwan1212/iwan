// src/proactive/proactiveClassify.js — Haiku gatekeeper: czy Iwan powinien się odezwać?
const Anthropic = require('@anthropic-ai/sdk');
const { getProactiveConfig } = require('./config');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Zapytaj Haiku czy Iwan powinien się odezwać
async function shouldIwanRespond(conversationText, triggerReason) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Jesteś gatekeeperem bota Iwan (asystent zespołu). Zdecyduj czy bot powinien się odezwać proaktywnie.

Powód triggera: ${triggerReason}

Rozmowa:
${conversationText.substring(0, 3000)}

Odpowiedz DOKŁADNIE w formacie:
DECISION: tak/nie
CONFIDENCE: 0.0-1.0
REASON: krótki powód

Zasady:
- TAK jeśli bot może dodać realną wartość (dane, odpowiedź na pytanie, podsumowanie)
- NIE jeśli to small-talk, żarty, luźna rozmowa bez pytania
- NIE jeśli ktoś już odpowiedział wyczerpująco
- NIE jeśli temat nie dotyczy pracy/zespołu`,
    }],
  });

  const text = response.content[0].text.trim();
  return parseGatekeeperResponse(text);
}

// Parsuj odpowiedź gatekeepera
function parseGatekeeperResponse(text) {
  const decisionMatch = text.match(/DECISION:\s*(tak|nie)/i);
  const confidenceMatch = text.match(/CONFIDENCE:\s*([\d.]+)/);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);

  const config = getProactiveConfig();

  const should = decisionMatch ? decisionMatch[1].toLowerCase() === 'tak' : false;
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0;
  const reason = reasonMatch ? reasonMatch[1].trim() : '';

  return {
    should: should && confidence >= config.confidenceThreshold,
    confidence,
    reason,
  };
}

module.exports = { shouldIwanRespond, parseGatekeeperResponse };
