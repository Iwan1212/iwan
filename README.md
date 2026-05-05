<div align="center">

# Iwan

### Open Source AI Agent for Slack — with Admin Dashboard

Mention `@Iwan` in Slack — it searches your Slack history, Notion, Pipedrive CRM, Workforce Planner, Calamari and Google Calendar, then answers using Claude with full context. Ships with a React admin dashboard for ops.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Claude](https://img.shields.io/badge/AI-Claude%20Sonnet%204.5-blueviolet)](https://anthropic.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[Getting Started](#getting-started) · [How It Works](#how-it-works) · [Integrations](#integrations) · [Dashboard](#admin-dashboard) · [Slash Commands](#slash-commands) · [Roadmap](#roadmap)

</div>

---

## What Iwan Does

Iwan is a Slack bot + admin dashboard. The bot connects to six data sources — Slack message history, Notion, Pipedrive CRM, Workforce Planner, Calamari (PTO) and Google Calendar — and uses Claude (Sonnet 4.5 + Haiku 4.5) to answer questions with context from all of them.

You ask a question in Slack. In **tool-use mode** Claude decides which sources to query and calls them as tools; in **legacy mode** all sources are queried in parallel. The whole thing takes 2–5 seconds.

Iwan also runs scheduled jobs (cron) — daily Pipedrive deal digests, weekly team allocation summaries, workforce anomaly detection, channel digests — and exposes everything through a REST API consumed by a React admin dashboard.

**Example interaction:**

```
You:   @Iwan kto wolny w marcu?

Iwan:  Na podstawie Workforce Planner — wolni w marcu:

       Backend:
       - Alex Johnson — 0% utilization
       - Sam Chen — 12% utilization

       PM:
       - Maria Torres — 0% utilization

       Razem: 4 osoby (z utilizacją <30%)
```

### Current State (v0.5)

| Phase | What | Status |
|-------|------|--------|
| 0 | Docker + CI/CD | ✅ |
| 1 | TypeScript migration | ✅ |
| 2 | Multi-Provider LLM (OpenRouter fallback) | ✅ |
| 3 | Write Tools (Pipedrive + Slack) | ✅ |
| 4 | Redis Cache | ✅ |
| 5 | Proactive 2.0 (cron, digest, anomaly) | ✅ |
| 6 | Dashboard + Monorepo | ✅ |
| 7 | Multi-Workspace | 🔜 |

**Known limitations:**
- **Slash commands are Polish-only** — `/iwan szukaj`, `/iwan kto-wolny` etc. English aliases planned for v0.6.
- **Search is full-text, not semantic** — Slack history and Notion use keyword matching via Supabase. Voyage AI + pgvector planned for v0.7.
- **Single workspace only** — no multi-tenant support yet (phase 7).
- **JWT tokens are in-memory** — Workforce Planner re-authenticates on restart.

---

## How It Works

```
@Iwan "kto wolny w marcu?"
    │
    ├── Validate (non-empty, ≤4000 chars)
    ├── Rate limit (per-user, in-memory)
    ├── Classify via Haiku 4.5 (small-talk / spam / question)
    │   └── small-talk → fast Haiku reply, skip context fetch
    │
    ├── Fetch context — two flows:
    │   ├── tool-use (ENABLE_TOOL_USE=true)
    │   │   Claude calls tools as needed:
    │   │   read_thread, read_channel, search_slack_history,
    │   │   search_notion, search_workforce, search_calamari,
    │   │   search_calendar, search_pipedrive, deal_status,
    │   │   create_event, create_deal_note, create_deal_activity,
    │   │   send_slack_message
    │   └── legacy — parallel fetch:
    │       Slack history + Notion + Workforce
    │
    ├── Inject knowledge files (apps/bot/knowledge/*.md)
    ├── Inject conversation history (Supabase)
    ├── Call Claude Sonnet 4.5 with system prompt + context
    │
    └── Format response (Markdown → Slack mrkdwn) and post in thread
```

In parallel, the bot runs:
- **Crawler** — real-time listener that indexes all messages from channels Iwan is invited to (Supabase full-text search)
- **Backfill trigger** — when added to a channel, asks for approval before backfilling (`approvalFlow.ts`)
- **Scheduler** — 10 cron jobs (see [Scheduled Jobs](#scheduled-jobs))
- **Dashboard API** — Express 5 REST API for the admin dashboard

<details>
<summary><strong>Repo structure</strong></summary>

```
apps/
├── bot/                      — @iwan/bot — Slack bot + REST API
│   ├── src/
│   │   ├── index.ts          # Entry point — Socket Mode + scheduler + API
│   │   ├── api/              # Dashboard API (Express 5)
│   │   │   ├── server.ts
│   │   │   ├── routes.ts
│   │   │   └── middleware.ts # Bearer auth + role resolution
│   │   ├── handlers/
│   │   │   ├── slash.ts      # /iwan command handler
│   │   │   └── approvalFlow.ts
│   │   ├── crawler/
│   │   │   ├── listener.ts
│   │   │   ├── backfill.ts
│   │   │   ├── backfillTrigger.ts
│   │   │   └── saveMessage.ts
│   │   ├── proactive/        # Proactive engine (auto-replies in active threads)
│   │   │   ├── engine.ts
│   │   │   ├── setup.ts
│   │   │   └── ...
│   │   └── services/
│   │       ├── claude.ts, claudeHaiku.ts, claudeTools.ts
│   │       ├── tools.ts, toolExecutor.ts, authorizedExecutor.ts
│   │       ├── models.ts            # Sonnet 4.5 + Haiku 4.5
│   │       ├── cache.ts             # Redis (ioredis) — graceful degradation
│   │       ├── scheduler.ts         # Centralized cron (replaces setInterval)
│   │       ├── search.ts, memory.ts, classify.ts, validate.ts, ratelimit.ts
│   │       ├── notion.ts, channelClassification.ts (restricted DBs)
│   │       ├── workforce.ts, workforceAlerts.ts, workforceAnomaly.ts
│   │       ├── pipedrive.ts, dealResolver.ts, dealDigest.ts, dealConfig.ts
│   │       ├── channelDigest.ts, channelAnomaly.ts
│   │       ├── calamari.ts, calendar.ts
│   │       ├── knowledge.ts         # Loads knowledge/*.md into LLM prompts
│   │       ├── llm.ts, openrouter.ts, anthropicClient.ts, promptCache.ts
│   │       ├── audit.ts, errors.ts, supabase.ts
│   │       └── format.ts, users.ts, channels.ts, context.ts, membership.ts
│   ├── knowledge/            # Company context (.md, auto-loaded into prompts)
│   ├── scripts/              # backfill.js, backfillDeals.js, backfillFull.js, seed-*.sql
│   ├── tests/                # 51 Jest test files (ts-jest)
│   └── Dockerfile            # node:20-alpine multi-stage (build + runtime)
│
├── dashboard/                — @iwan/dashboard — React 19 admin SPA
│   ├── src/
│   │   ├── App.tsx, main.tsx
│   │   ├── pages/            # Health, Scheduler, Errors, Cache, Channels,
│   │   │                     # Workforce, DealDigests, Config, Login
│   │   ├── components/       # Layout, DataTable, RefreshButton, StatusBadge
│   │   └── api/              # Fetch wrappers
│   └── vite.config.ts
│
└── packages/shared/          — @iwan/shared — types + constants
    └── src/
        ├── types.ts
        ├── constants.ts      # CACHE_TTL, APP_VERSION, role/label types
        └── index.ts
```

</details>

---

## Integrations

### Slack
Socket Mode (`@slack/bolt` v4) — no public URL or webhook needed. Listens for `@Iwan` mentions, replies in-thread. Background crawler indexes all messages from channels Iwan is invited to, storing them in Supabase for full-text search. Supports image input (PNG/JPEG/GIF/WebP, ≤4MB, max 3 per message) via Claude vision.

### Notion
`@notionhq/client` v5. Extracts keywords from question (Polish stop-words removed), searches workspace, fetches page content (paragraphs, headings, tables, callouts, nested blocks). Up to 3 pages per query, truncated to 1500 chars each. Supports **restricted databases** — channels labeled `leadership` see all pages; other channels are filtered (`NOTION_RESTRICTED_DATABASES` env).

### Pipedrive CRM
Full deal-intelligence integration:
- **On-demand deal lookup** — `@Iwan status deal Acme` or `/iwan deal Acme`
- **Daily digest (Mon–Fri)** — auto-summarizes Slack conversations and writes them to Pipedrive deal notes with `[Slack Summary]` prefix
- **Channel-to-deal mapping** — auto-resolves `#sales-*` channels by prefix; shared channels via LLM extraction (cached in Supabase `deal_channel_mappings`)
- **Action items** — extracts next steps and creates Pipedrive activities
- **Backfill** — `node scripts/backfillDeals.js --days 7 [--dry-run] [--deal "Acme"]`

### Workforce Planner
Read-only integration with internal Workforce Planner (FastAPI + PostgreSQL, JWT auth). Polish date parsing — "w marcu", "Q1", "w kwietniu". Used for team allocation queries, overbooking detection, availability lookups, and **two cron jobs**: daily alerts (overbooking + low utilization) and weekly Monday team-allocation summary.

### Calamari
Time-off / PTO lookups via Calamari API. Tool: `search_calamari`.

### Google Calendar
Read events + create events. Service account auth (`GOOGLE_SERVICE_ACCOUNT_KEY`), supports multiple calendars. Tools: `search_calendar`, `create_event`. Configurable timezone (default `Europe/Warsaw`).

### OpenRouter (LLM fallback)
When Anthropic API fails, automatically retries via OpenRouter — keeps Iwan responsive during Anthropic outages. Optional (`OPENROUTER_API_KEY`).

### Redis (cache)
`ioredis` v5 with graceful degradation — no `REDIS_URL` = no cache, app still works. Cache-aside wrapper with TTL (`withCache`). Used for Pipedrive deal lookups, Notion pages, channel/user resolution.

---

## Admin Dashboard

React 19 + Vite 6 + Tailwind 4 + TanStack Query SPA at `apps/dashboard/`. Talks to the bot's REST API (`apps/bot/src/api/`) over HTTP. Bearer-token auth with **three roles**:

- `leadership` — full access, can modify channel access levels
- `growth` — sees only `open` channels and `growth`-labeled channels
- default — read-only health/config

**Pages:** Health · Scheduler (manual job triggers) · Errors · Cache · Channels (with access-level controls for leadership) · Workforce alerts · Deal digest history · Config (feature flags) · Login

### Dashboard API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | none | Uptime, Redis status, job count, version |
| GET | `/api/scheduler/jobs` | bearer | List registered cron jobs |
| POST | `/api/scheduler/jobs/:name/trigger` | bearer | Manual job trigger |
| GET | `/api/errors` | bearer | Last 50 errors from `error_logs` |
| GET | `/api/cache/stats` | bearer | Redis stats (memory, key count, clients) |
| GET | `/api/channels` | bearer | Channel list + message counts (filtered per role) |
| POST | `/api/channels/:id/access` | leadership only | Set channel access level / label |
| GET | `/api/deals/digests` | bearer | Pipedrive digest state history |
| GET | `/api/workforce/alerts` | bearer | Workforce alert log |
| GET | `/api/audit` | bearer | Tool-use audit logs (filtered per role) |
| GET | `/api/config` | bearer | Safe feature flags (no secrets) |

Disabled by default. Enable with `ENABLE_DASHBOARD_API=true` and set `DASHBOARD_API_TOKEN` (+ optional `DASHBOARD_TOKEN_LEADERSHIP` / `DASHBOARD_TOKEN_GROWTH` for role separation).

---

## Slash Commands

All commands are currently **Polish-only**. English aliases are the [v0.6 priority](#v06--english-commands--enhanced-workforce).

| Command | What it does |
|---------|--------------|
| `/iwan szukaj <fraza>` | Full-text search in Slack message history (Supabase RPC) |
| `/iwan notion <fraza>` | Search Notion pages by keyword (with restricted DB filtering) |
| `/iwan team <nazwa>` | Show team members with utilization % (e.g. `team Backend`) |
| `/iwan kto-wolny [miesiąc]` | List people with <30% utilization |
| `/iwan overbooking` | List people with >100% utilization (next 2 months) |
| `/iwan projekty` | List active projects |
| `/iwan deal <nazwa>` | Show Pipedrive deal status (CRM data + recent notes) |
| `/iwan deals [pipeline_id]` | List active deals from configured pipelines |
| `/iwan status` | Bot uptime, memory, Node version |

Restrict commands to specific channels with `SLACK_ALLOWED_CHANNELS` (comma-separated channel IDs).

---

## Scheduled Jobs

Centralized in `services/scheduler.ts` (`node-cron` v4, timezone `Europe/Warsaw`). Jobs register conditionally based on env vars.

| Job | Schedule | Condition |
|-----|----------|-----------|
| `health-check` | every 5 min | always |
| `deal-digest` | Mon–Fri at `DEAL_DIGEST_HOUR` (default 7) | `PIPEDRIVE_API_TOKEN` |
| `deal-inactive-check` | Mon–Fri at 9:00 | `PIPEDRIVE_API_TOKEN` |
| `workforce-alerts` | daily at 8:00 | `WP_ALERT_CHANNEL` + `WP_API_URL` |
| `workforce-alerts-cleanup` | daily at 3:00 | `WP_ALERT_CHANNEL` |
| `workforce-weekly-summary` | Mondays at `WP_SUMMARY_HOUR` (default 8) | `WP_SUMMARY_CHANNEL` + `WP_API_URL` |
| `workforce-anomaly` | Mon–Fri at 9:00 | `WP_ALERT_CHANNEL` + `WP_API_URL` |
| `channel-digest` | Mon–Fri at `CHANNEL_DIGEST_HOUR` (default 8) | `CHANNEL_DIGEST_ENABLED=true` |
| `channel-anomaly` | every 30 min | `CHANNEL_ANOMALY_ENABLED=true` |
| `proactive-cleanup` | every hour | `ENABLE_PROACTIVE=true` |

Trigger any job manually via dashboard or `POST /api/scheduler/jobs/:name/trigger`.

---

## Getting Started

### Prerequisites

- **Node.js 20.x**
- **pnpm 9** (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Slack workspace** with Bot Token + App Token (Socket Mode enabled)
- **Supabase** project (tables: `slack_messages`, `conversations`, `error_logs`, `audit_logs`, `deal_channel_mappings`, `deal_digest_state`, `channel_access_levels`)
- **Anthropic API key**
- _(optional)_ Redis instance for caching (`REDIS_URL`)
- _(optional)_ Notion / Pipedrive / Workforce Planner / Calamari / Google Calendar

### Installation

```bash
git clone <your-repo-url> iwan
cd iwan
pnpm install --frozen-lockfile

cp .env.example .env            # then fill in your credentials
psql ... -f apps/bot/scripts/seed-deal-tables.sql
psql ... -f apps/bot/scripts/seed-access-control.sql
psql ... -f apps/bot/scripts/seed-company-context.sql

pnpm turbo typecheck            # full typecheck across monorepo
pnpm turbo test                 # 51 Jest test files (apps/bot)
pnpm turbo build                # build shared + bot + dashboard

# Run bot
node apps/bot/dist/src/index.js

# Run dashboard (dev)
pnpm --filter @iwan/dashboard dev

# Run bot (dev with hot reload)
pnpm --filter @iwan/bot dev      # uses tsx
```

### Docker

```bash
docker compose up               # see docker-compose.yml
# or
docker build -f apps/bot/Dockerfile -t iwan .
docker run --env-file .env iwan
```

The Dockerfile is multi-stage (`node:20-alpine`): builds shared + bot + dashboard with `pnpm turbo build`, then ships only `dist/` and prod deps.

### Environment Variables

<details>
<summary><strong>Required</strong></summary>

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token (`xapp-...`) for Socket Mode |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude Sonnet 4.5 + Haiku 4.5 |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon key |

</details>

<details>
<summary><strong>Slack — optional</strong></summary>

| Variable | Description |
|----------|-------------|
| `SLACK_ADMIN_USER_ID` | Slack user ID with admin privileges (approves backfills) |
| `SLACK_ALLOWED_CHANNELS` | Comma-separated channel IDs — restrict slash commands |

</details>

<details>
<summary><strong>Tool-use mode — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_TOOL_USE` | `false` | When `true`, Claude decides which tools to call. When `false`, parallel-fetch legacy mode. |

</details>

<details>
<summary><strong>Cache — optional</strong></summary>

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | e.g. `redis://localhost:6379`. Without this, all cache reads return null and writes are skipped. |

</details>

<details>
<summary><strong>Notion — optional</strong></summary>

| Variable | Description |
|----------|-------------|
| `NOTION_TOKEN` | Notion integration token (`secret_...`) |
| `NOTION_RESTRICTED_DATABASES` | Comma-separated DB IDs visible only to leadership channels |

</details>

<details>
<summary><strong>Pipedrive CRM — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PIPEDRIVE_API_TOKEN` | — | Without this, all CRM features and `deal-*` jobs are disabled |
| `PIPEDRIVE_DOMAIN` | — | Subdomain (e.g. `your-company`) |
| `PIPEDRIVE_ACTIVE_PIPELINES` | `1` | Comma-separated pipeline IDs to monitor |
| `DEAL_DIGEST_CHANNEL` | — | Slack channel for digest status messages |
| `DEAL_DIGEST_HOUR` | `7` | Hour to run daily digest (0–23) |
| `DEAL_SALES_PREFIX` | `sales-` | Prefix for auto-discovered deal channels |
| `DEAL_MONITORED_CHANNELS` | `deals` | Comma-separated shared channel names |
| `DEAL_MIN_MESSAGES` | `3` | Min messages before a thread gets summarized |
| `DEAL_NOTE_PREFIX` | `[Slack Summary]` | Prefix on Pipedrive notes |
| `DEAL_LANGUAGE` | `pl` | Summary language |

</details>

<details>
<summary><strong>Workforce Planner — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `WP_API_URL` | — | Workforce Planner API base URL |
| `WP_EMAIL` | — | Login email (JWT auth) |
| `WP_PASSWORD` | — | Login password |
| `WP_ALERT_CHANNEL` | — | Channel for overbooking + anomaly alerts |
| `WP_ALERT_INTERVAL_HOURS` | `24` | How often to check |
| `WP_LOW_UTIL_THRESHOLD` | `20` | Low utilization alert threshold (%) |
| `WP_SUMMARY_CHANNEL` | — | Channel for Monday weekly summary |
| `WP_SUMMARY_HOUR` | `8` | Hour to post Monday summary (0–23) |
| `WORKFORCE_ANOMALY_ALLOC_DROP_PCT` | `30` | Allocation-drop alert threshold |
| `WORKFORCE_ANOMALY_ALLOC_SPIKE_PCT` | `50` | Allocation-spike alert threshold |

</details>

<details>
<summary><strong>Calamari + Google Calendar — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `CALAMARI_URL` | — | e.g. `https://yourcompany.calamari.io` |
| `CALAMARI_API_KEY` | — | API key |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | — | JSON service account credentials |
| `GOOGLE_CALENDAR_IDS` | — | Comma-separated calendar IDs |
| `GOOGLE_CALENDAR_TIMEZONE` | `Europe/Warsaw` | IANA timezone |

</details>

<details>
<summary><strong>Proactive engine — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_PROACTIVE` | `false` | Enable proactive auto-replies in active threads |
| `PROACTIVE_CHANNELS` | `general,team` | Channels to monitor |
| `PROACTIVE_THREAD_THRESHOLD` | `5` | Min thread messages before considering reply |
| `PROACTIVE_CHANNEL_MESSAGE_INTERVAL` | `15` | Min message gap before channel-level reply |
| `PROACTIVE_CONFIDENCE_THRESHOLD` | `0.7` | Min Claude confidence to send |
| `PROACTIVE_GLOBAL_MAX_PER_HOUR` | `10` | Global rate limit |
| `PROACTIVE_THREAD_COOLDOWN_MINUTES` | `60` | Per-thread cooldown |
| `PROACTIVE_CHANNEL_COOLDOWN_MINUTES` | `30` | Per-channel cooldown |

</details>

<details>
<summary><strong>Channel digest + anomaly — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `CHANNEL_DIGEST_ENABLED` | `false` | Daily channel summary |
| `CHANNEL_DIGEST_HOUR` | `8` | Run hour |
| `CHANNEL_DIGEST_CHANNEL` | — | Where to post digest |
| `CHANNEL_DIGEST_CHANNELS` | `general,team` | Channels to summarize |
| `CHANNEL_ANOMALY_ENABLED` | `false` | Detect message-volume spikes |
| `CHANNEL_ANOMALY_CHANNEL` | — | Where to post anomaly alerts |
| `CHANNEL_ANOMALY_CHANNELS` | `general,team` | Channels to monitor |
| `CHANNEL_ANOMALY_SPIKE_MULTIPLIER` | `3` | Multiplier over baseline to trigger |

</details>

<details>
<summary><strong>LLM fallback — optional</strong></summary>

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter key — fallback when Anthropic API fails |

</details>

<details>
<summary><strong>Dashboard API — optional</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_DASHBOARD_API` | `false` | Enable REST API server |
| `DASHBOARD_API_PORT` | `3100` | Listen port |
| `DASHBOARD_API_TOKEN` | — | Default bearer token (read-only) |
| `DASHBOARD_TOKEN_LEADERSHIP` | — | Leadership-role bearer token |
| `DASHBOARD_TOKEN_GROWTH` | — | Growth-role bearer token |

</details>

---

## Tech Stack

| Component | Tool | Version |
|-----------|------|---------|
| Runtime | Node.js | 20.x |
| Language | TypeScript (strict, NodeNext) | 5.9 |
| Monorepo | pnpm workspaces + Turborepo | pnpm 9.15, turbo 2.5 |
| Slack | `@slack/bolt` (Socket Mode) | 4.6 |
| AI (answers) | Claude Sonnet 4.5 via `@anthropic-ai/sdk` | `claude-sonnet-4-5-20250929` |
| AI (classification + small-talk) | Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
| LLM fallback | OpenRouter | — |
| API | Express (Dashboard REST API) | 5.x |
| Database | Supabase (PostgreSQL + full-text search) | 2.97 |
| Cache | Redis via `ioredis` (graceful degradation) | 5.10 |
| Scheduler | `node-cron` (timezone Europe/Warsaw) | 4.2 |
| Knowledge base | Notion API (`@notionhq/client`) | 5.9 |
| Workforce data | Workforce Planner (FastAPI, JWT) | — |
| PTO | Calamari API | — |
| Calendar | `googleapis` | 171 |
| Dashboard | React 19 + Vite 6 + Tailwind 4 + TanStack Query | — |
| Tests | Jest + ts-jest (51 test files in `apps/bot/tests/`) | 29 |
| CI | GitHub Actions (pnpm + turbo typecheck/test/build) | — |
| Container | Docker (`node:20-alpine`, multi-stage) | — |
| Hosting | Railway | — |

---

## Contributing

Iwan is MIT-licensed. Contributions welcome — bug fixes, new features, docs, tests.

### How to Contribute

1. Fork the repo and clone locally
2. `pnpm install --frozen-lockfile`
3. Create a branch: `git checkout -b feat/my-feature`
4. Write code following the conventions below
5. Add tests in `apps/bot/tests/`
6. Run `pnpm turbo typecheck && pnpm turbo test && pnpm turbo build` — all green
7. Open a PR

### Conventions

| Rule | Detail |
|------|--------|
| One function = one task | `searchWorkforce()` searches. `buildContextFromWorkforce()` formats. They don't do both. |
| Max 30 lines per function | If it's longer, split it. |
| Comments in Polish above functions | Polish-origin project. `// Pobierz timeline alokacji` |
| English variable names | `const employees = ...`, `const startDate = ...` |
| Don't overwrite, add new files | Especially in services/ — new file > big edit to existing |
| Graceful degradation | Service functions return `[]`, `''`, or `null` on error — never throw |
| TypeScript strict, no `any` (or annotated) | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` if unavoidable |

### Good First Contributions

- **English command aliases** — `/iwan search`, `/iwan who-free`, `/iwan projects`. Start with `apps/bot/src/handlers/slash.ts`.
- **English keyword routing** — `shouldQueryWorkforce()` in `apps/bot/src/services/workforce.ts` only detects Polish phrases.
- **Configurable response language** — currently hardcoded Polish in system prompts.
- **English date parsing** — Workforce date helpers parse "w marcu", "Q1" etc., not "next month" / "in March".

---

## Roadmap

### v0.6 — English Commands & Enhanced Workforce
- [ ] English command aliases — `/iwan search`, `/iwan who-free`, `/iwan projects`
- [ ] English keyword routing for Workforce queries
- [ ] Configurable response language (EN/PL)
- [ ] `/iwan person <name>` — individual person lookup
- [ ] `/iwan projekty` — show assigned people per project
- [ ] Smarter date parsing — "next week", "next month"

### v0.7 — Semantic Search
- [ ] Voyage AI embeddings to replace keyword-based full-text search
- [ ] pgvector in Supabase for vector similarity
- [ ] Cross-source ranking — prioritize most relevant results
- [ ] Thread-aware context — include parent thread messages

### v0.8 — Proactive Intelligence
- [ ] Daily channel summary — "what happened yesterday"
- [ ] Capacity planning — "do we have people for a new project in Q2?"
- [ ] Utilization trend tracking over time
- [ ] Pipedrive deal-health scoring

### v1.0 — Production Ready
- [ ] **Multi-Workspace** support (phase 7)
- [ ] Nango for managed external integrations
- [ ] Configurable system prompt per workspace
- [ ] Workspace-level rate limiting
- [ ] Persistent JWT token storage (replace in-memory)
- [ ] Two-way Pipedrive sync (Pipedrive → Slack notifications)

### v2.0 — Autonomous Agent
- [ ] E2B sandbox for code execution
- [ ] Write-back to Workforce Planner (create assignments)
- [ ] Jira / Linear integration
- [ ] Automated resource suggestions based on skills + availability

Directional only — priorities shift based on what users need.

---

<div align="center">

**Iwan** is built by [Momentum](https://themomentum.ai) and the open source community.

If you find it useful, a star helps others discover it.

[MIT License](LICENSE)

</div>
