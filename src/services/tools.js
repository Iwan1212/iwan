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
    {
      name: 'search_calendar',
      description: 'Przeszukaj Google Calendar — spotkania, wydarzenia, dostępność. Używaj do pytań o spotkania, harmonogram dnia, co jest zaplanowane, kiedy ktoś jest zajęty.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Zapytanie dotyczące spotkań/wydarzeń w kalendarzu',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'create_event',
      description: 'Utwórz nowe spotkanie/wydarzenie w Google Calendar. Używaj gdy użytkownik chce umówić spotkanie, zaplanować meeting, dodać wydarzenie do kalendarza.',
      input_schema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Tytuł spotkania/wydarzenia',
          },
          start_datetime: {
            type: 'string',
            description: 'Data i godzina rozpoczęcia w formacie ISO 8601 (np. 2026-03-07T10:00:00+01:00)',
          },
          end_datetime: {
            type: 'string',
            description: 'Data i godzina zakończenia w formacie ISO 8601 (np. 2026-03-07T11:00:00+01:00)',
          },
          attendees: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista adresów email uczestników (opcjonalne)',
          },
          description: {
            type: 'string',
            description: 'Opis spotkania (opcjonalne)',
          },
        },
        required: ['title', 'start_datetime', 'end_datetime'],
      },
    },
  ];
}

module.exports = { getToolDefinitions };
