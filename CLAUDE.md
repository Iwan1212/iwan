# CLAUDE.md — Kontekst projektu Iwan

## Co to jest Iwan
Open-source AI agent Slack. Crawluje wiadomości z kanałów, odpowiada na pytania z kontekstem.

## Stack (v0.5 → v1.0 upgrade w toku)
- Runtime: Node.js 20 LTS
- Język: TypeScript (strict, NodeNext)
- Monorepo: pnpm workspaces + Turborepo
- Slack: @slack/bolt (Socket Mode)
- AI: @anthropic-ai/sdk (claude-sonnet-4-20250514)
- Dashboard: React 19 + Vite + Tailwind CSS 4 + TanStack Query
- API: Express 5 (dashboard REST API)
- Baza: Supabase (PostgreSQL, full-text search)
- Hosting: Railway
- Docker: Node 20 Alpine, multi-stage build (pnpm + turbo)
- CI: GitHub Actions (pnpm + turbo typecheck/test/build)
- Testy: Jest 29 (ts-jest), 48 suites, 500+ assertions

## Struktura monorepo
```
apps/bot/         — @iwan/bot (Slack bot + Express API)
apps/dashboard/   — @iwan/dashboard (React SPA admin panel)
packages/shared/  — @iwan/shared (typy + stałe)
```

## Upgrade Plan v0.5 → v1.0 (OpenViktor level)
Cel: 7.5/10+ — kolejność faz: resilience → features → optymalizacja → tooling

| Faza | Co | Status |
|------|----|--------|
| 0 | Docker + CI/CD | DONE |
| 1 | TypeScript migration | DONE |
| 2 | Multi-Provider LLM | DONE |
| 3 | Write Tools (Pipedrive + Slack) | DONE |
| 4 | Redis Cache | DONE |
| 5 | Proactive 2.0 (cron, digest, anomaly) | DONE |
| 6 | Dashboard + Monorepo | DONE |
| 7 | Multi-Workspace | do zrobienia |

Zasada: jedna faza = jeden PR. pnpm turbo test zielone przed mergem.

## CZEGO JESZCZE NIE UŻYWAMY
- Nango (integracje zewnętrzne) — planowane v1.0
- E2B (sandbox) — planowane v2.0
- Voyage AI (embeddingi) — planowane v1.0
- pgvector (vector search) — planowane v1.0

## Dashboard API
- Guard: ENABLE_DASHBOARD_API=true (domyślnie off)
- Auth: Bearer token (DASHBOARD_API_TOKEN)
- Port: DASHBOARD_API_PORT (default 3100)
- Endpointy: /api/health, /api/scheduler/jobs, /api/errors, /api/cache/stats, /api/channels, /api/deals/digests, /api/workforce/alerts, /api/config

## Zainstalowane zasoby ECC (.claude/)
Skills: docker-patterns, cost-aware-llm-pipeline, backend-patterns, database-migrations,
  verification-loop, security-review, tdd-workflow, frontend-patterns, api-design,
  postgres-patterns, deployment-patterns
Agents: architect, code-reviewer, tdd-guide, planner, refactor-cleaner, security-reviewer,
  doc-updater, loop-operator
Commands: /plan, /tdd, /code-review, /quality-gate, /build-fix, /verify, /model-route
Rules: common/* (9 plików), typescript/* (5 plików)

## Integracja Pipedrive CRM
- Klient API: apps/bot/src/services/pipedrive.ts (search, get, notes, activities)
- Deal resolver: apps/bot/src/services/dealResolver.ts (Slack kanał → Pipedrive deal, cache w Supabase)
- Daily digest: apps/bot/src/services/dealDigest.ts (Pn-Pt, automatyczne podsumowania → Pipedrive notes)
- Narzędzia Claude: search_pipedrive, deal_status, create_deal_note, create_deal_activity, send_slack_message (w tools.ts + toolExecutor.ts)
- Slash commands: /iwan deal <name>, /iwan deals
- Backfill: apps/bot/scripts/backfillDeals.js (--days N, --dry-run, --deal "Acme")
- Knowledge system: apps/bot/knowledge/*.md → injected do LLM prompts (src/services/knowledge.ts)
- LLM fallback: apps/bot/src/services/openrouter.ts (Anthropic → OpenRouter)
- Supabase tabele: deal_channel_mappings, deal_digest_state (scripts/seed-deal-tables.sql)

## Zasady kodowania
- Jedna funkcja = jedno zadanie
- Max 30 linii na funkcję
- Komentarz PO POLSKU nad każdą funkcją
- NIE NADPISUJ istniejącego kodu
- Dodawaj nowe pliki zamiast modyfikować stare
- Proste nazwy zmiennych (angielskie)
