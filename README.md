# entire-poc-backend
Backend service for the Entire IO Pattern C validation PoC. Handles ingestion of Entire checkpoint data from GitHub and serves metrics via a REST API.
I am superman
## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your GitHub token and owner
```

## Run

```bash
# Development (with auto-reload)
npm run dev

# Production build
npm run build
npm start
```

The server runs on `http://localhost:3001` by default.

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | Ingestion status |
| POST | `/api/ingest/run` | Trigger re-ingestion |
| GET | `/api/charts/sessions-over-time` | Chart 1 data |
| GET | `/api/charts/agent-percentage` | Chart 4 data |
| GET | `/api/charts/slash-commands` | Chart 14 data |
| GET | `/api/charts/tool-usage` | Chart 21 data |
| GET | `/api/charts/friction` | Chart 25 data |
| GET | `/api/charts/open-items` | Chart 26 data |
| GET | `/api/sessions/:sessionId` | Session drill-down |
| GET | `/api/sessions/cross-repo` | Cross-Repo Session Map |

## Test

```bash
npm test
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | (required) | GitHub personal access token |
| `GITHUB_OWNER` | (required) | GitHub username |
| `WORKSPACE_REPO` | `entire-poc-workspace` | Workspace repo name |
| `SERVICE_REPOS` | `entire-poc-backend,entire-poc-frontend` | Comma-separated service repo names |
| `PORT` | `3001` | HTTP port |
| `DB_PATH` | `./data/poc.db` | SQLite database path |
| `INGESTION_INTERVAL_MS` | `300000` | Ingestion interval (5 min) |
