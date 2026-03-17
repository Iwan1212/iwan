# CLAUDE.md — Kontekst projektu Iwan

## Co to jest Iwan
Open-source AI agent Slack. Crawluje wiadomości z kanałów, odpowiada na pytania z kontekstem.

## Stack (v0.5 → v1.0 upgrade w toku)
- Runtime: Node.js 20 LTS
- Slack: @slack/bolt (Socket Mode)
- AI: @anthropic-ai/sdk (claude-sonnet-4-20250514)
- Baza: Supabase (PostgreSQL, full-text search)
- Hosting: Railway
- Docker: Node 20 Alpine, docker-compose (Dockerfile + docker-compose.yml)
- CI: GitHub Actions (npm ci, npm test, node --check)
- Testy: Jest 29, 39 suites, 363 assertions
- Pliki: 42 źródłowe, 39 testów

## Upgrade Plan v0.5 → v1.0 (OpenViktor level)
Cel: 7.5/10+ — kolejność faz: resilience → features → optymalizacja → tooling

| Faza | Co | Status |
|------|----|--------|
| 0 | Docker + CI/CD | DONE |
| 1 | TypeScript migration | do zrobienia |
| 2 | Multi-Provider LLM | do zrobienia |
| 3 | Write Tools (Notion, Slack, Pipedrive) | do zrobienia |
| 4 | Redis Cache | do zrobienia |
| 5 | Proactive 2.0 (cron, digest, anomaly) | do zrobienia |
| 6 | Dashboard + Monorepo | do zrobienia |
| 7 | Multi-Workspace | do zrobienia |

Zasada: jedna faza = jeden PR. npm test zielone przed mergem.

## CZEGO JESZCZE NIE UŻYWAMY
- Nango (integracje zewnętrzne) — planowane v1.0
- E2B (sandbox) — planowane v2.0
- Voyage AI (embeddingi) — planowane v1.0
- pgvector (vector search) — planowane v1.0

## Zainstalowane zasoby ECC (.claude/)
Skills: docker-patterns, cost-aware-llm-pipeline, backend-patterns, database-migrations,
  verification-loop, security-review, tdd-workflow, frontend-patterns, api-design,
  postgres-patterns, deployment-patterns
Agents: architect, code-reviewer, tdd-guide, planner, refactor-cleaner, security-reviewer,
  doc-updater, loop-operator
Commands: /plan, /tdd, /code-review, /quality-gate, /build-fix, /verify, /model-route
Rules: common/* (9 plików), typescript/* (5 plików)

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
