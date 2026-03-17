// src/proactive/topicDetector.js — wykrywanie tematów (keyword match, zero AI)

const TOPIC_KEYWORDS = {
  dostepnosc: new Set([
    'dostępny', 'dostępna', 'dostępni', 'dostepny', 'dostepna', 'dostepni',
    'dostępność', 'dostepnosc', 'availability', 'available',
    'wolny', 'wolna', 'wolni', 'zajęty', 'zajęta', 'zajęci',
    'kto może', 'kto moze', 'kto jest wolny', 'bench',
  ]),
  urlopy: new Set([
    'urlop', 'urlopie', 'urlopu', 'urlopy', 'urlopów',
    'wakacje', 'wakacji', 'wakacjach',
    'nieobecny', 'nieobecna', 'nieobecni', 'nieobecność', 'nieobecnosc',
    'zwolnienie', 'zwolnieniu', 'l4', 'chorobowe', 'chorobowym',
    'dniwolne', 'dzień wolny', 'dzien wolny',
    'pto', 'time off', 'day off',
  ]),
  deadline: new Set([
    'deadline', 'deadlina', 'deadlinu', 'termin', 'terminu', 'terminach',
    'do kiedy', 'na kiedy', 'pilne', 'pilnego', 'asap', 'urgent',
    'opóźnienie', 'opoznienie', 'spóźnienie', 'delay',
    'sprint', 'sprintu', 'milestone', 'release',
  ]),
  procesy: new Set([
    'proces', 'procesu', 'procesy', 'procedura', 'procedury',
    'onboarding', 'offboarding', 'workflow', 'flow',
    'jak zgłosić', 'jak zglosic', 'jak zrobić', 'jak zrobic',
    'instrukcja', 'instrukcji', 'krok po kroku',
    'szablon', 'template', 'checklist',
  ]),
  spotkania: new Set([
    'spotkanie', 'spotkania', 'spotkaniu', 'meeting', 'meetingu',
    'standup', 'daily', 'weekly', 'retro', 'retrospektywa',
    'review', 'planning', 'refinement', 'demo',
    'call', 'sync', 'catch-up', 'catchup',
  ]),
};

// Wykryj tematy na podstawie keywords w tekście
function detectTopics(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        matched.push(topic);
        break;
      }
    }
  }

  return matched;
}

module.exports = { detectTopics, TOPIC_KEYWORDS };
