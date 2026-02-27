# Iwan — Open Source AI Agent for Slack

Iwan is an open-source AI agent that works as a team coworker in Slack. It crawls and remembers messages from channels, answers questions using Claude AI, and provides context-aware responses based on your team's conversation history, Notion knowledge base, and Workforce Planner data.

## Features

- **Context-aware AI** — answers questions using Claude with context from Slack history, Notion, and Workforce Planner
- **Slack message crawler** — indexes messages from channels for full-text search
- **Notion integration** — searches your team's knowledge base for relevant pages
- **Workforce Planner integration** — answers questions about team allocation, utilization, and availability
- **Slash commands** — quick access to search, team data, and project info
- **Proactive alerts** — daily overbooking and low utilization alerts on Slack
- **Weekly summary** — automated Monday morning team allocation report
- **Guardrails** — rate limiting, spam detection, message validation
- **Conversation memory** — remembers context within threads

## Architecture

```
User @Iwan → Validate → Rate Limit → Classify
                ↓
    Search Slack + Notion + Workforce (parallel)
                ↓
       Get conversation history (Supabase)
                ↓
       Claude API with combined context
                ↓
       Format → Send to Slack
```

```
src/
├── index.js                # Main entry point — Socket Mode bot
├── handlers/
│   └── slash.js            # Slash command handler (/iwan)
├── services/
│   ├── workforce.js        # Workforce Planner API integration
│   ├── workforceAlerts.js  # Proactive alerts + weekly summary
│   ├── notion.js           # Notion API integration
│   ├── claude.js           # Claude AI calls
│   ├── search.js           # Slack message search
│   ├── memory.js           # Conversation history (Supabase)
│   ├── classify.js         # Message classification (spam detection)
│   ├── format.js           # Markdown → Slack mrkdwn
│   ├── validate.js         # Input validation
│   ├── ratelimit.js        # Rate limiting
│   ├── users.js            # User name resolution
│   ├── channels.js         # Channel name cache
│   ├── errors.js           # Error logging
│   └── supabase.js         # Supabase client
├── crawler/
│   ├── listener.js         # Real-time message listener
│   └── saveMessage.js      # Save messages to Supabase
tests/
├── workforce.test.js       # 31 tests
├── notion.test.js          # 26 tests
├── slash.test.js
├── ...                     # 109 tests total
```

## Integrations

### Slack (core)

Iwan connects to Slack via Socket Mode and:
- Listens for `@Iwan` mentions and responds in threads
- Crawls messages from all channels it's invited to
- Provides slash commands (`/iwan`)
- Posts proactive alerts and weekly summaries

**Required env vars:** `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`

### Notion

Iwan searches your team's Notion workspace to answer knowledge-related questions (processes, KPIs, documentation).

How it works:
- Extracts keywords from the user's question (removes Polish stop-words)
- Searches Notion pages via full-text search API
- Extracts content from matching pages (paragraphs, headings, tables, callouts)
- Passes up to 3 pages as context to Claude

Example: `@Iwan jakie KPI ma dział delivery?` → searches Notion, finds the KPI page, Claude answers based on content.

**Required env vars:** `NOTION_TOKEN`

### Workforce Planner

Iwan integrates with Workforce Planner (FastAPI + PostgreSQL) to answer questions about team allocation, utilization, and availability. **Read-only** — Iwan never modifies data.

How it works:
- **Keyword routing** — `shouldQueryWorkforce()` detects workforce-related questions using phrase matching and keyword counting (2+ keywords required to avoid false positives)
- **JWT auth** — logs in via `/api/auth/login`, keeps tokens in memory, auto-refreshes on expiry
- **Timeline API** — fetches employee assignments and utilization for requested date range
- **Polish month parsing** — understands "w marcu", "Q1", "w kwietniu" and maps to date ranges
- **Context building** — formats data compactly (team → employees → projects + utilization %) and passes to Claude

Examples:
- `@Iwan kto jest wolny w marcu?` → lists available people grouped by team
- `@Iwan team backend` → shows Backend team with allocations and utilization
- `@Iwan kto jest overbookowany?` → Claude lists overbooked employees with percentages

#### Proactive alerts

When `WP_ALERT_CHANNEL` is configured, Iwan checks the timeline daily and posts alerts for:
- **Overbooking** — utilization > 100%
- **Low utilization** — utilization < 20% (configurable via `WP_LOW_UTIL_THRESHOLD`)

Alerts are deduplicated in memory to avoid spam.

#### Weekly summary

When `WP_SUMMARY_CHANNEL` is configured, every Monday morning Iwan generates a team allocation summary including:
- Overall company utilization
- Utilization per team
- People on bench (0% allocation)
- Overbooked employees
- Ending and new assignments

The summary is generated by Claude based on raw data, formatted in Polish.

**Required env vars:** `WP_API_URL`, `WP_EMAIL`, `WP_PASSWORD`
**Optional env vars:** `WP_ALERT_CHANNEL`, `WP_SUMMARY_CHANNEL`, `WP_ALERT_INTERVAL_HOURS`, `WP_LOW_UTIL_THRESHOLD`, `WP_SUMMARY_HOUR`

## Slash Commands

| Command | Description |
|---------|-------------|
| `/iwan szukaj <fraza>` | Search Slack message history |
| `/iwan notion <fraza>` | Search Notion knowledge base |
| `/iwan team <nazwa>` | Team utilization (e.g. Frontend, Backend) |
| `/iwan kto-wolny [miesiąc]` | Available people (optional: month name) |
| `/iwan overbooking` | List overbooked employees |
| `/iwan projekty` | Active projects |
| `/iwan status` | Bot status (uptime, memory) |

## Setup

### Prerequisites

- Node.js 20.x
- Slack workspace with Bot Token and App Token (Socket Mode)
- Supabase project (PostgreSQL + full-text search)
- Anthropic API key (Claude)
- _(optional)_ Notion integration token
- _(optional)_ Workforce Planner instance

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Iwan1212/iwan.git
   cd iwan
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Start the bot:
   ```bash
   npm start
   ```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_BOT_TOKEN` | Yes | Slack bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | Yes | Slack app token (`xapp-...`) for Socket Mode |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon key |
| `NOTION_TOKEN` | No | Notion integration token |
| `WP_API_URL` | No | Workforce Planner API base URL |
| `WP_EMAIL` | No | Workforce Planner login email |
| `WP_PASSWORD` | No | Workforce Planner login password |
| `WP_ALERT_CHANNEL` | No | Slack channel ID for overbooking alerts |
| `WP_ALERT_INTERVAL_HOURS` | No | Alert check interval (default: 24) |
| `WP_LOW_UTIL_THRESHOLD` | No | Low utilization threshold % (default: 20) |
| `WP_SUMMARY_CHANNEL` | No | Slack channel ID for weekly summary |
| `WP_SUMMARY_HOUR` | No | Hour to send weekly summary (default: 8) |

## Contributing

Contributions are welcome! Iwan is MIT-licensed and open to the community.

### How to contribute

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feat/my-feature`
3. **Write code** following the coding guidelines below
4. **Write tests** — every new module should have a corresponding test file in `tests/`
5. **Run tests** — make sure `npm test` passes (all 109+ tests)
6. **Submit a Pull Request** with a clear description of what you changed and why

### Coding guidelines

- **One function = one task** — keep functions focused and single-purpose
- **Max 30 lines per function** — if it's longer, split it
- **Comments in Polish** above each function
- **Simple English variable names** — `tekst`, `wyniki` are OK for Polish context vars
- **Do not overwrite existing code** — add new files/functions instead of rewriting
- **Graceful degradation** — functions return empty results on error, never throw
- **No TypeScript** — plain JavaScript (Node.js 20)
- **No Docker** — Railway builds automatically from `npm start`

### Test conventions

- Follow the pattern from `tests/notion.test.js` or `tests/workforce.test.js`
- Mock external dependencies (`jest.mock(...)`)
- Test both happy path and error cases
- Use descriptive test names (Polish is fine)
- Run `npm test` before submitting — all tests must pass

### Good first issues

Look for issues labeled `good-first-issue` or consider:
- Adding new slash commands
- Improving context formatting for Claude
- Adding support for new Workforce Planner endpoints
- Better error messages in Polish
- Adding more test coverage

## Roadmap

### v0.6 — Enhanced Workforce
- [ ] Fix `/iwan projekty` to show assigned people (join with timeline data)
- [ ] `/iwan osoba <imię>` — show person's assignments and utilization
- [ ] Smarter date detection — "na przyszły tydzień", "w następnym miesiącu"
- [ ] Configurable team names (env var or Notion page)

### v0.7 — Better Context & Search
- [ ] Voyage AI embeddings for semantic search (replace full-text)
- [ ] pgvector in Supabase for vector similarity search
- [ ] Context ranking — prioritize most relevant results from each source
- [ ] Slack thread context — include parent thread when answering in threads

### v0.8 — Proactive Intelligence
- [ ] Daily standup summary — "co się działo wczoraj na kanałach"
- [ ] Smart alerts — detect project risk patterns from Workforce data
- [ ] Capacity planning — "czy mamy ludzi na nowy projekt w Q2?"
- [ ] Trend tracking — utilization trends over time

### v1.0 — Production Ready
- [ ] Nango for managed external integrations
- [ ] Multi-workspace support
- [ ] Admin dashboard (who's asking what, response quality)
- [ ] Configurable system prompt per workspace
- [ ] Rate limiting per workspace (not just per user)
- [ ] Proper token refresh rotation (not just in-memory)

### v2.0 — Autonomous Agent
- [ ] E2B sandbox for code execution
- [ ] Write-back to Workforce Planner (create assignments, update allocations)
- [ ] Jira/Linear integration — link allocation to actual tickets
- [ ] Automated resource suggestions — "Nowak Anna is free and has React experience, assign to Project X?"
- [ ] Multi-language support (English, Polish)

## Tech Stack

| Component | Tool |
|-----------|------|
| Runtime | Node.js 20 |
| Slack | @slack/bolt (Socket Mode) |
| AI | Claude Sonnet (via @anthropic-ai/sdk) |
| Database | Supabase (PostgreSQL) |
| Knowledge base | Notion API |
| Workforce | Workforce Planner (FastAPI) |
| Testing | Jest |
| Hosting | Railway |

## License

[MIT](LICENSE) — use it, fork it, improve it.
