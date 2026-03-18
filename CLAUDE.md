# CLAUDE.md — Kontekst projektu Iwan

## Co to jest Iwan
Open-source AI agent Slack. Crawluje wiadomości z kanałów, odpowiada na pytania z kontekstem.

## Stack (v0.5 → v1.0 upgrade w toku)
- Runtime: Node.js 20 LTS
- Język: TypeScript (strict, NodeNext)
- Slack: @slack/bolt (Socket Mode)
- AI: @anthropic-ai/sdk (claude-sonnet-4-20250514)
- Baza: Supabase (PostgreSQL, full-text search)
- Hosting: Railway
- Docker: Node 20 Alpine, multi-stage build (tsc → dist/)
- CI: GitHub Actions (npm ci, npm run typecheck, npm test)
- Testy: Jest 29 (ts-jest), 41 suites, 408 assertions
- Pliki: 43 źródłowe (.ts), 41 testów (.js)

## Upgrade Plan v0.5 → v1.0 (OpenViktor level)
Cel: 7.5/10+ — kolejność faz: resilience → features → optymalizacja → tooling

| Faza | Co | Status |
|------|----|--------|
| 0 | Docker + CI/CD | DONE |
| 1 | TypeScript migration | DONE |
| 2 | Multi-Provider LLM | DONE |
| 3 | Write Tools (Pipedrive + Slack) | DONE |
| 4 | Redis Cache | DONE |
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
- Klient API: src/services/pipedrive.ts (search, get, notes, activities)
- Deal resolver: src/services/dealResolver.ts (Slack kanał → Pipedrive deal, cache w Supabase)
- Daily digest: src/services/dealDigest.ts (Pn-Pt, automatyczne podsumowania → Pipedrive notes)
- Narzędzia Claude: search_pipedrive, deal_status, create_deal_note, create_deal_activity, send_slack_message (w tools.ts + toolExecutor.ts)
- Slash commands: /iwan deal <name>, /iwan deals
- Backfill: scripts/backfillDeals.js (--days N, --dry-run, --deal "Acme")
- Knowledge system: knowledge/*.md → injected do LLM prompts (src/services/knowledge.ts)
- LLM fallback: src/services/openrouter.ts (Anthropic → OpenRouter)
- Supabase tabele: deal_channel_mappings, deal_digest_state (scripts/seed-deal-tables.sql)

## Zasady kodowania
- Jedna funkcja = jedno zadanie
- Max 30 linii na funkcję
- Komentarz PO POLSKU nad każdą funkcją
- NIE NADPISUJ istniejącego kodu
- Dodawaj nowe pliki zamiast modyfikować stare
- Proste nazwy zmiennych (angielskie)
