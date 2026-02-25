# Schemat bazy danych MVP

## Tabela: conversations
Przechowuje historię rozmów z Iwanem (pytanie-odpowiedź).

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | BIGSERIAL PK | Auto-increment ID |
| channel_id | TEXT NOT NULL | Slack channel ID |
| thread_ts | TEXT | Thread timestamp (null = główny kanał) |
| user_id | TEXT NOT NULL | Slack user ID |
| role | TEXT NOT NULL | 'user' lub 'assistant' |
| content | TEXT NOT NULL | Treść wiadomości |
| created_at | TIMESTAMPTZ | Automatyczny timestamp |

Indeks: idx_conversations_thread (channel_id, thread_ts)

## Tabela: slack_messages
Przechowuje WSZYSTKIE wiadomości z kanałów (crawler).

| Kolumna | Typ | Opis |
|---------|-----|------|
| id | BIGSERIAL PK | Auto-increment ID |
| channel_id | TEXT NOT NULL | Slack channel ID |
| channel_name | TEXT | Nazwa kanału |
| user_id | TEXT NOT NULL | Slack user ID |
| user_name | TEXT | Nazwa użytkownika |
| message_text | TEXT NOT NULL | Treść wiadomości |
| thread_ts | TEXT | Thread timestamp |
| message_ts | TEXT NOT NULL UNIQUE | Unikalny Slack timestamp |
| created_at | TIMESTAMPTZ | Automatyczny timestamp |

Indeksy:
- idx_slack_messages_search — GIN (to_tsvector('simple', message_text))
- idx_slack_messages_channel — (channel_id)
- idx_slack_messages_ts — (message_ts)

## RPC: search_slack_messages(search_query, result_limit)
Full-text search w tabeli slack_messages. Używa plainto_tsquery('simple', ...).
