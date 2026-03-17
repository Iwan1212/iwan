// src/services/tools.ts — definicje narzędzi dla Claude tool use
import type { ToolDefinition } from '../types/index.js';

// Zwróć tablicę definicji narzędzi w formacie Anthropic API
export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'read_thread',
      description: 'Odczytaj wiadomości z bieżącego wątku (threadu) Slack. Używaj gdy użytkownik pyta o podsumowanie, kontekst lub treść rozmowy w tym wątku.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'read_channel',
      description: 'Odczytaj ostatnie wiadomości z bieżącego kanału Slack. Używaj gdy użytkownik prosi o podsumowanie dyskusji, co się działo na kanale, ostatnie ustalenia. Lepsze od search_slack_history gdy chodzi o ostatnie wiadomości a nie konkretną frazę.',
      input_schema: {
        type: 'object',
        properties: { count: { type: 'number', description: 'Ile ostatnich wiadomości pobrać (domyślnie 200, max 500)' } },
        required: [],
      },
    },
    {
      name: 'search_slack_history',
      description: 'Przeszukaj historię wiadomości Slack w bieżącym kanale. Używaj do pytań o rozmowy, decyzje, ustalenia zespołowe, co ktoś pisał.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Zapytanie do wyszukania w historii Slack' } },
        required: ['query'],
      },
    },
    {
      name: 'search_notion',
      description: 'Przeszukaj Notion — dokumentację, procedury, wiki firmowe. Używaj do pytań o procesy, zasady, dokumentację techniczną.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Zapytanie do wyszukania w Notion' } },
        required: ['query'],
      },
    },
    {
      name: 'search_workforce',
      description: 'Przeszukaj Workforce Planner — alokacje pracowników, dostępność, utylizacja, przypisania do projektów. Używaj do pytań o to kto jest wolny, kto pracuje nad czym, jaka jest utylizacja zespołu. WAŻNE: Przy pytaniach o dostępność zawsze wywołaj też search_calamari żeby uwzględnić urlopy i nieobecności.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Zapytanie dotyczące alokacji/dostępności pracowników' } },
        required: ['query'],
      },
    },
    {
      name: 'search_calamari',
      description: 'Sprawdź urlopy i nieobecności w Calamari. Używaj do pytań o to kto jest na urlopie, kto będzie nieobecny, ile urlopu zostało. WAŻNE: Zawsze wywołuj razem z search_workforce przy pytaniach o dostępność zespołu.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Zapytanie dotyczące urlopów/nieobecności pracowników' } },
        required: ['query'],
      },
    },
    {
      name: 'search_calendar',
      description: 'Przeszukaj Google Calendar — spotkania, wydarzenia, dostępność. Używaj do pytań o spotkania, harmonogram dnia, co jest zaplanowane, kiedy ktoś jest zajęty. WAŻNE: Brak wydarzeń w kalendarzu NIE oznacza dnia wolnego — dni wolne to tylko soboty i niedziele. WAŻNE: Zawsze wywołuj to narzędzie gdy pytanie dotyczy kalendarza lub spotkań — nawet w follow-up wiadomościach w wątku. Jeśli użytkownik podaje konkretną datę, użyj jej w query. Masz dostęp do kalendarza przez Google API — nigdy nie mów że nie masz dostępu. WAŻNE: Tytuły eventów bywają skrótowe lub mają prefiksy (np. "[Strategia] - Leadership status"). Dopasowuj semantycznie — jeśli user pyta o "spotkanie leadershipowe K framework", event "[Strategia] - Leadership status i K Framework" TO JEST to spotkanie.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Zapytanie dotyczące spotkań/wydarzeń w kalendarzu' } },
        required: ['query'],
      },
    },
    {
      name: 'search_pipedrive',
      description: 'Przeszukaj Pipedrive CRM — deale, statusy, wartości, właściciele. Używaj do pytań o deale, klientów, szanse sprzedażowe, pipeline, co się dzieje z danym dealem.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Nazwa deala lub firmy do wyszukania w Pipedrive' } },
        required: ['query'],
      },
    },
    {
      name: 'deal_status',
      description: 'Pobierz pełny status deala z Pipedrive CRM — dane CRM + ostatnie notatki + powiązane wiadomości Slack. Używaj gdy użytkownik pyta o status konkretnego deala, podsumowanie deala, co nowego w danym dealu. WAŻNE: Wymaga ID deala — najpierw użyj search_pipedrive żeby znaleźć deal.',
      input_schema: {
        type: 'object',
        properties: { deal_id: { type: 'number', description: 'ID deala w Pipedrive (uzyskaj z search_pipedrive)' } },
        required: ['deal_id'],
      },
    },
    {
      name: 'create_event',
      description: 'Utwórz nowe spotkanie/wydarzenie w Google Calendar. Używaj gdy użytkownik chce umówić spotkanie, zaplanować meeting, dodać wydarzenie do kalendarza.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Tytuł spotkania/wydarzenia' },
          start_datetime: { type: 'string', description: 'Data i godzina rozpoczęcia w formacie ISO 8601 (np. 2026-03-07T10:00:00+01:00)' },
          end_datetime: { type: 'string', description: 'Data i godzina zakończenia w formacie ISO 8601 (np. 2026-03-07T11:00:00+01:00)' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Lista adresów email uczestników (opcjonalne)' },
          description: { type: 'string', description: 'Opis spotkania (opcjonalne)' },
        },
        required: ['title', 'start_datetime', 'end_datetime'],
      },
    },
  ];
}

// Zwróć definicje narzędzi z cache_control na ostatnim narzędziu (prompt caching)
export function getToolDefinitionsWithCache(): ToolDefinition[] {
  const tools = getToolDefinitions();
  const last = { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } };
  return [...tools.slice(0, -1), last];
}
