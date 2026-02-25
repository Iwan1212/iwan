# CLAUDE.md — Kontekst projektu Iwan

## Co to jest Iwan
Open-source AI agent Slack. Crawluje wiadomości z kanałów, odpowiada na pytania z kontekstem.

## Stack MVP (v0.1)
- Runtime: Node.js 20 LTS
- Slack: @slack/bolt (Socket Mode)
- AI: @anthropic-ai/sdk (claude-sonnet-4-20250514)
- Baza: Supabase (PostgreSQL, full-text search)
- Hosting: Railway

## CZEGO NIE UŻYWAMY W MVP
- Nango (integracje zewnętrzne) — planowane v1.0
- E2B (sandbox) — planowane v2.0
- Voyage AI (embeddingi) — planowane v1.0
- pgvector (vector search) — planowane v1.0
- TypeScript — piszemy w czystym JavaScript
- Docker — Railway buduje sam

## Zasady kodowania
- Jedna funkcja = jedno zadanie
- Max 30 linii na funkcję
- Komentarz PO POLSKU nad każdą funkcją
- NIE NADPISUJ istniejącego kodu
- Dodawaj nowe pliki zamiast modyfikować stare
- Proste nazwy zmiennych (angielskie)
