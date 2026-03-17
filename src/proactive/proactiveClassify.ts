// src/proactive/proactiveClassify.ts — Haiku gatekeeper: czy Iwan powinien się odezwać?
import { anthropic } from '../services/anthropicClient.js';
import { MODEL_HAIKU } from '../services/models.js';
import { getProactiveConfig } from './config.js';

interface GatekeeperResult {
  should: boolean;
  confidence: number;
  reason: string;
}

// Zapytaj Haiku czy Iwan powinien się odezwać
export async function shouldIwanRespond(conversationText: string, triggerReason: string): Promise<GatekeeperResult> {
  const response = await anthropic.messages.create({
    model: MODEL_HAIKU,
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

  const text = (response.content[0] as { text: string }).text.trim();
  return parseGatekeeperResponse(text);
}

// Parsuj odpowiedź gatekeepera
export function parseGatekeeperResponse(text: string): GatekeeperResult {
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
