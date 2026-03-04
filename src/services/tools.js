// src/services/tools.js — definicje narzędzi dla Claude tool use

// Zwróć tablicę definicji narzędzi w formacie Anthropic API
function getToolDefinitions() {
  return [
    {
      name: 'read_thread',
      description: 'Odczytaj wiadomości z bieżącego wątku (threadu) Slack. Używaj gdy użytkownik pyta o podsumowanie, kontekst lub treść rozmowy w tym wątku.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'search_slack_history',
      description: 'Przeszukaj historię wiadomości Slack w bieżącym kanale. Używaj do pytań o rozmowy, decyzje, ustalenia zespołowe, co ktoś pisał.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Zapytanie do wyszukania w historii Slack',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_notion',
      description: 'Przeszukaj Notion — dokumentację, procedury, wiki firmowe. Używaj do pytań o procesy, zasady, dokumentację techniczną.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Zapytanie do wyszukania w Notion',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_workforce',
      description: 'Przeszukaj Workforce Planner — alokacje pracowników, dostępność, utylizacja, przypisania do projektów. Używaj do pytań o to kto jest wolny, kto pracuje nad czym, jaka jest utylizacja zespołu. WAŻNE: Przy pytaniach o dostępność zawsze wywołaj też search_calamari żeby uwzględnić urlopy i nieobecności.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Zapytanie dotyczące alokacji/dostępności pracowników',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_calamari',
      description: 'Sprawdź urlopy i nieobecności w Calamari. Używaj do pytań o to kto jest na urlopie, kto będzie nieobecny, ile urlopu zostało. WAŻNE: Zawsze wywołuj razem z search_workforce przy pytaniach o dostępność zespołu.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Zapytanie dotyczące urlopów/nieobecności pracowników',
          },
        },
        required: ['query'],
      },
    },
  ];
}

module.exports = { getToolDefinitions };
