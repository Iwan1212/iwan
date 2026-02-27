# Changelog

## v0.5 — Workforce Planner Integration
- Integracja z Workforce Planner API (JWT auth, read-only)
- Nowe slash commands: `/iwan team`, `/iwan kto-wolny`, `/iwan overbooking`, `/iwan projekty`
- Kontekst z Workforce trafia do Claude obok Slack i Notion
- Keyword routing — automatyczne wykrywanie pytań o alokację/utylizację
- Proaktywne alerty overbookingu (daily, konfigurowalny interwał)
- Weekly summary — cotygodniowe podsumowanie alokacji (poniedziałek rano)
- Bypass klasyfikacji spam dla zapytań workforce
- 31 nowych testów (łącznie 109)

## v0.4 — Notion Integration
- Integracja z Notion API jako drugie źródło kontekstu
- Ekstrakcja keywords z pytań (usuwanie polskich stop-words)
- Głębokie czytanie treści stron (paragrafy, nagłówki, tabele, callouty)
- Slash command `/iwan notion <fraza>`
- 26 testów Notion

## v0.3 — Slash Commands & UX
- Reakcje emoji (👀 przetwarzam / ✅ gotowe)
- Slash command `/iwan szukaj`, `/iwan notion`, `/iwan status`
- Thread support — odpowiedzi w wątkach

## v0.2 — Infrastructure
- Pamięć rozmów w Supabase (per kanał + per wątek)
- Channel name cache + error logging do Supabase
- User name resolution
- Rate limiting (10 msg/min per user)
- Klasyfikacja wiadomości (spam detection via Claude Haiku)
- Walidacja wiadomości
- Formatowanie Markdown → Slack mrkdwn
- Health check + Procfile (Railway)
- 47 testów

## v0.1 — MVP
- Echo bot → Q&A z Claude Sonnet
- Slack crawler + backfill historii
- Kontekst z historii Slack (full-text search via Supabase RPC)
- Socket Mode (bez publicznego URL)
- Guardrails: walidacja, rate limit, klasyfikacja
- 22 testy
