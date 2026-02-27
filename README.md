<div align="center">

# Iwan

### Open Source AI Agent for Slack

Mention `@Iwan` in Slack — it searches your message history, Notion docs, and Workforce Planner, then answers using Claude AI with full context.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-109%20passing-brightgreen)](tests/)
[![Claude AI](https://img.shields.io/badge/AI-Claude%20Sonnet-blueviolet)](https://anthropic.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

[Getting Started](#getting-started) · [How It Works](#how-it-works) · [Integrations](#integrations) · [Commands](#slash-commands) · [Contributing](#contributing) · [Roadmap](#roadmap)

</div>

---

## What Iwan Does

Iwan is a Slack bot that connects to three data sources — Slack message history, Notion, and Workforce Planner — and uses Claude AI to answer questions with context from all three.

You ask a question in Slack. Iwan figures out which sources are relevant, fetches the data in parallel, and passes it to Claude as context. Claude generates the answer. The whole thing takes 2-5 seconds.

**Example interaction:**

```
You:   @Iwan who's available in March?

Iwan:  Based on Workforce Planner data, available people in March:

       Backend:
       - Alex Johnson — 0% utilization
       - Sam Chen — 0% utilization

       PM:
       - Maria Torres — 0% utilization

       UX/UI Designer:
       - Sophie Lee — 0% utilization

       Total: 4 people available
```

Iwan also posts proactive alerts (overbooking, low utilization) and generates a weekly team allocation summary every Monday morning.

### Current State

Iwan is at **v0.5**. It's running in production for one team, handling real questions daily. The core functionality works, but there are limitations:

- **Commands are Polish-only** — slash commands like `/iwan szukaj` and `/iwan kto-wolny` don't have English equivalents yet. This is the [top priority for v0.6](#v06--english-commands--enhanced-workforce).
- **Keyword routing is basic** — Iwan decides which data source to query using keyword matching, not semantic understanding. It works well for direct questions but misses nuanced phrasing.
- **Search is full-text, not semantic** — Slack history and Notion searches use keyword matching via Supabase. Vector embeddings (Voyage AI + pgvector) are planned for v0.7.
- **Single workspace only** — there's no multi-tenant support. One Iwan instance = one Slack workspace.
- **Tokens are in-memory** — Workforce Planner JWT tokens are stored in module variables. A restart means re-authentication (~200ms, but still).

---

## How It Works

```
User @Iwan "who's free in March?"
    │
    ├── Validate (non-empty, under 4000 chars)
    ├── Rate limit (10 messages/min per user)
    ├── Classify via Claude Haiku (skip if workforce query)
    │
    ├── Search Slack history ──────┐
    ├── Search Notion pages ───────┼── parallel, each returns in 200-800ms
    ├── Query Workforce Planner ───┘
    │
    ├── Combine context (max ~4000 chars per source)
    ├── Fetch conversation history from Supabase
    ├── Call Claude Sonnet with system prompt + context + history
    │
    └── Format response (Markdown → Slack mrkdwn) and post in thread
```

Smart routing determines which sources to query. If you ask "who's available in March?", Workforce Planner is queried. If you ask "what's our KPI process?", Notion is searched. Slack history is always searched. The routing uses phrase matching and keyword counting — it needs 2+ workforce-related keywords to trigger a Workforce query, which avoids false positives.

<details>
<summary><strong>Project structure</strong></summary>

```
src/
├── index.js                  # Entry point — Socket Mode bot
├── handlers/
│   └── slash.js              # /iwan command handler
├── services/
│   ├── workforce.js          # Workforce Planner API (JWT, timeline, context)
│   ├── workforceAlerts.js    # Proactive alerts + weekly summary
│   ├── notion.js             # Notion API (search, page extraction)
│   ├── claude.js             # Claude AI calls (Sonnet for answers, Haiku for classification)
│   ├── search.js             # Slack full-text search via Supabase RPC
│   ├── memory.js             # Conversation history (Supabase)
│   ├── classify.js           # Spam detection (Claude Haiku, ~100ms)
│   ├── format.js             # Markdown → Slack mrkdwn conversion
│   ├── validate.js           # Input validation
│   ├── ratelimit.js          # In-memory rate limiting (Map)
│   ├── users.js              # User name resolution + cache
│   ├── channels.js           # Channel name cache
│   ├── errors.js             # Error logging to Supabase
│   └── supabase.js           # Database client
└── crawler/
    ├── listener.js           # Real-time message listener (all channels)
    └── saveMessage.js        # Persist to slack_messages table

tests/                        # 109 tests (Jest), ~0.3s total runtime
├── workforce.test.js         # 31 tests — routing, auth, context building
├── notion.test.js            # 26 tests — keyword extraction, page parsing
├── slash.test.js
├── claude.test.js
├── search.test.js
└── ...
```

</details>

---

## Integrations

### Slack

Connects via Socket Mode — no public URL or webhook endpoint needed. The bot listens for `@Iwan` mentions and responds in the same thread. A background crawler indexes all messages from channels Iwan is invited to, storing them in Supabase for full-text search.

### Notion

Searches your workspace for relevant pages. Extracts keywords from the question (removes Polish stop-words), calls Notion's search API, then fetches page content — paragraphs, headings, tables, callouts, and nested blocks. Up to 3 pages are passed as context to Claude, truncated to 1500 chars each.

**What works:** Finding pages by keyword, extracting structured content (tables, nested blocks).
**What doesn't:** Semantic search (keyword-only), database entries with complex filters.

### Workforce Planner

Read-only integration with a Workforce Planner instance (FastAPI + PostgreSQL). Authenticates via JWT (`POST /api/auth/login`), queries the timeline API for employee assignments and utilization, and formats the data as context for Claude.

The integration parses natural language dates in Polish — "w marcu" (in March), "Q1", "w kwietniu" (in April) — and maps them to API date ranges. English date parsing is not yet supported.

**What works:** Team allocation queries, overbooking detection, availability lookups, proactive alerts.
**What doesn't:** Individual person deep-dives, write operations (by design — Iwan is read-only), English date parsing.

<details>
<summary><strong>Proactive alerts</strong></summary>

When `WP_ALERT_CHANNEL` is configured, Iwan checks the timeline daily (configurable interval) and posts to Slack:
- **Overbooking** — anyone with utilization > 100%
- **Low utilization** — anyone below 20% (configurable threshold)

Alerts are deduplicated in memory using a `Set` with keys like `empId-month-type`. The set is cleared every 24 hours. This means a restart will re-send alerts for the current period — acceptable for now, but a proper persistence layer would be better.
</details>

<details>
<summary><strong>Weekly summary</strong></summary>

When `WP_SUMMARY_CHANNEL` is configured, every Monday at a configurable hour (default: 8:00), Iwan fetches the timeline for the current and next month, formats raw data, and sends it to Claude with a prompt to generate a team allocation summary. Claude formats the response — utilization per team, people on bench, overbooked employees, new and ending assignments.

The check runs via `setInterval` every hour and compares `day === 1` (Monday) and `hour === SUMMARY_HOUR`. Not precise to the minute, but good enough.
</details>

---

## Slash Commands

All commands are currently in **Polish only**. English aliases are the [top priority for v0.6](#v06--english-commands--enhanced-workforce).

| Command | What it does |
|---------|-------------|
| `/iwan szukaj <query>` | Full-text search in Slack message history |
| `/iwan notion <query>` | Search Notion pages by keyword |
| `/iwan team <name>` | Show team members with utilization % (e.g. `team Backend`) |
| `/iwan kto-wolny [month]` | List people with <30% utilization |
| `/iwan overbooking` | List people with >100% utilization (next 2 months) |
| `/iwan projekty` | List active projects (note: doesn't show assigned people yet) |
| `/iwan status` | Bot uptime and memory usage |

---

## Getting Started

### Prerequisites

- **Node.js 20.x**
- **Slack workspace** with Bot Token + App Token (Socket Mode enabled)
- **Supabase** project with `slack_messages`, `conversations`, and `error_logs` tables
- **Anthropic API key**
- _(optional)_ Notion integration token
- _(optional)_ Workforce Planner instance with API access

### Installation

```bash
git clone https://github.com/Iwan1212/iwan.git
cd iwan
npm install
cp .env.example .env    # then fill in your credentials
npm test                # 109 tests, should pass in <1s
npm start               # starts Socket Mode connection
```

### Environment Variables

<details>
<summary><strong>Required</strong></summary>

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Slack app-level token (`xapp-...`) for Socket Mode |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon key |

</details>

<details>
<summary><strong>Optional — Notion</strong></summary>

| Variable | Description |
|----------|-------------|
| `NOTION_TOKEN` | Notion integration token (`secret_...`). Without this, Notion search is silently skipped. |

</details>

<details>
<summary><strong>Optional — Workforce Planner</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `WP_API_URL` | — | Workforce Planner API base URL. Without this, all workforce features are disabled. |
| `WP_EMAIL` | — | Login email for JWT authentication |
| `WP_PASSWORD` | — | Login password |
| `WP_ALERT_CHANNEL` | — | Slack channel ID for overbooking alerts. Without this, alerts are disabled. |
| `WP_ALERT_INTERVAL_HOURS` | `24` | How often to check (hours) |
| `WP_LOW_UTIL_THRESHOLD` | `20` | Low utilization alert threshold (%) |
| `WP_SUMMARY_CHANNEL` | — | Slack channel ID for weekly summary. Without this, summaries are disabled. |
| `WP_SUMMARY_HOUR` | `8` | Hour to post Monday summary (0-23) |

</details>

---

## Contributing

Iwan is MIT-licensed. Contributions are welcome — bug fixes, new features, documentation, tests.

### How to Contribute

1. Fork the repo and clone locally
2. Create a branch: `git checkout -b feat/my-feature`
3. Write code following the conventions below
4. Add tests for new functionality
5. Run `npm test` — all 109+ tests must pass
6. Open a Pull Request with a clear description of what changed and why

### Conventions

| Rule | Detail |
|------|--------|
| One function = one task | `searchWorkforce()` searches. `buildContextFromWorkforce()` formats. They don't do both. |
| Max 30 lines per function | If it's longer, split it into smaller functions. |
| Comments in Polish above functions | This is a Polish-origin project. Code comments are in Polish (`// Pobierz timeline alokacji`). |
| English variable names | `const employees = ...`, `const startDate = ...` |
| Graceful degradation | Return `[]`, `''`, or `null` on error. Never throw from service functions. |
| Plain JavaScript | No TypeScript. Node.js 20 with native `fetch`. |

### Tests

Every service file has a corresponding test file in `tests/`. Follow the pattern from `tests/workforce.test.js`:

```javascript
// Mock external dependencies
jest.mock('../src/services/errors', () => ({ logError: jest.fn() }));
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Set env vars for module initialization
process.env.WP_API_URL = 'https://wp.test.dev';

// Import after mocks are set up
const { shouldQueryWorkforce } = require('../src/services/workforce');

// Reset mocks between tests
beforeEach(() => { mockFetch.mockReset(); });

// Test both happy path and error cases
it('returns null on API error', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'));
  const result = await searchWorkforce('who is free?');
  expect(result).toBeNull();
});
```

### Good First Contributions

- **Add English command aliases** — all commands are Polish-only (`/iwan szukaj`, `/iwan kto-wolny`). Adding English versions (`/iwan search`, `/iwan who-free`) is the [top v0.6 priority](#v06--english-commands--enhanced-workforce). Start with `src/handlers/slash.js`.
- **Add English keyword routing** — `shouldQueryWorkforce()` in `src/services/workforce.js` only detects Polish phrases. Adding English equivalents ("who is available", "show utilization") would make the bot work for English-speaking teams.
- **Improve context formatting** — `buildContextFromWorkforce()` outputs plain text. Better formatting could help Claude generate more accurate responses.
- **Increase test coverage** — error paths in `slash.js` handlers are not tested yet.

---

## Roadmap

### v0.6 — English Commands & Enhanced Workforce

> **Good first contribution.** All slash commands and keyword detection are currently Polish-only. English aliases would make Iwan usable for international teams.

- [ ] English command aliases — `/iwan search`, `/iwan who-free`, `/iwan projects` alongside Polish versions
- [ ] English keyword routing — detect workforce questions in English
- [ ] Configurable response language (EN/PL)
- [ ] `/iwan person <name>` — individual person lookup
- [ ] `/iwan projekty` — show assigned people per project (currently shows 0 — the `/api/projects` endpoint doesn't return members)
- [ ] Smarter date parsing — "next week", "next month"

### v0.7 — Semantic Search
- [ ] Voyage AI embeddings to replace keyword-based full-text search
- [ ] pgvector in Supabase for vector similarity
- [ ] Context ranking — prioritize most relevant results across sources
- [ ] Thread-aware context — include parent thread messages

### v0.8 — Proactive Intelligence
- [ ] Daily channel summary — "what happened yesterday"
- [ ] Risk pattern detection from Workforce data
- [ ] Capacity planning — "do we have people for a new project in Q2?"
- [ ] Utilization trend tracking over time

### v1.0 — Production Ready
- [ ] Nango for managed external integrations
- [ ] Multi-workspace support
- [ ] Admin dashboard (usage stats, query logs)
- [ ] Configurable system prompt per workspace
- [ ] Workspace-level rate limiting
- [ ] Persistent token storage (replace in-memory JWT)

### v2.0 — Autonomous Agent
- [ ] E2B sandbox for code execution
- [ ] Write-back to Workforce Planner (create assignments, update allocations)
- [ ] Jira / Linear integration
- [ ] Automated resource suggestions based on skills and availability

These are directional — no fixed timelines. Priorities shift based on what users actually need.

---

## Tech Stack

| Component | Tool |
|-----------|------|
| Runtime | Node.js 20 |
| Slack | @slack/bolt (Socket Mode) |
| AI (answers) | Claude Sonnet via @anthropic-ai/sdk |
| AI (classification) | Claude Haiku (spam detection, ~100ms) |
| Database | Supabase (PostgreSQL + full-text search) |
| Knowledge base | Notion API (@notionhq/client) |
| Workforce data | Workforce Planner (FastAPI, JWT auth) |
| Tests | Jest (109 tests, ~0.3s) |
| Hosting | Railway |

No TypeScript. No Docker. No build step. `npm start` runs `node src/index.js` directly.

---

<div align="center">

**Iwan** is built by [Momentum](https://github.com/Iwan1212) and the open source community.

If you find it useful, a star helps others discover it.

[![Star on GitHub](https://img.shields.io/github/stars/Iwan1212/iwan?style=social)](https://github.com/Iwan1212/iwan)

[MIT License](LICENSE)

</div>
