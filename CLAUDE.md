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

## Integracja Pipedrive CRM
- Klient API: src/services/pipedrive.js (search, get, notes, activities)
- Deal resolver: src/services/dealResolver.js (Slack kanał → Pipedrive deal, cache w Supabase)
- Daily digest: src/services/dealDigest.js (Pn-Pt, automatyczne podsumowania → Pipedrive notes)
- Narzędzia Claude: search_pipedrive, deal_status (w tools.js + toolExecutor.js)
- Slash commands: /iwan deal <name>, /iwan deals
- Backfill: scripts/backfillDeals.js (--days N, --dry-run, --deal "Acme")
- Knowledge system: knowledge/*.md → injected do LLM prompts (src/services/knowledge.js)
- LLM fallback: src/services/openrouter.js (Anthropic → OpenRouter)
- Supabase tabele: deal_channel_mappings, deal_digest_state (scripts/seed-deal-tables.sql)

## Zasady kodowania
- Jedna funkcja = jedno zadanie
- Max 30 linii na funkcję
- Komentarz PO POLSKU nad każdą funkcją
- NIE NADPISUJ istniejącego kodu
- Dodawaj nowe pliki zamiast modyfikować stare
- Proste nazwy zmiennych (angielskie)
