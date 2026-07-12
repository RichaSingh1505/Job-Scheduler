# Relay — Distributed Job Scheduler

A production-shaped distributed job scheduler: a REST API, a horizontally
scalable worker fleet that atomically claims and executes jobs against
MySQL, a cron-based recurring job promoter, and an operator dashboard.

📄 **Read next:** [`docs/architecture.md`](docs/architecture.md) ·
[`docs/er-diagram.md`](docs/er-diagram.md) ·
[`docs/api-documentation.md`](docs/api-documentation.md) ·
[`docs/design-decisions.md`](docs/design-decisions.md)

## What's inside

```
job-scheduler/
├── database/schema.sql     MySQL schema (source of truth)
├── backend/                REST API + Socket.IO (Node/Express)
├── worker/                 Polls, claims, executes jobs (Node)
├── scheduler/               Promotes due cron definitions into jobs (Node)
├── frontend/                Operator dashboard (React/Vite)
├── docs/                    Architecture, ER diagram, API docs, design decisions
└── docker-compose.yml       One-command local stack
```

## Option A — run everything with Docker (fastest)

Requires Docker + Docker Compose.

```bash
docker compose up --build
```

This starts MySQL (schema auto-loaded from `database/schema.sql`), the
backend on `:4000`, two worker replicas, the scheduler, and the dashboard on
`:5173`. Open **http://localhost:5173**, click "Create one" to register an
organization, and you're in.

## Option B — run each service manually

### 1. MySQL

```bash
mysql -u root -p < database/schema.sql
```

This creates the `job_scheduler` database and all tables.

### 2. Backend API

```bash
cd backend
cp .env.example .env      # edit DB_* and JWT_SECRET
npm install
npm run dev                # nodemon, or `npm start` for plain node
```
Runs on `http://localhost:4000`. Health check: `GET /health`.

### 3. Worker (run as many as you like, in separate terminals)

```bash
cd worker
cp .env.example .env       # edit DB_*
npm install
npm start
```
Start a second one in another terminal to see distributed claiming in
action — jobs will be split across both without double-processing.

### 4. Scheduler (recurring/cron jobs)

```bash
cd scheduler
cp .env.example .env
npm install
npm start
```

### 5. Frontend dashboard

```bash
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:4000
npm install
npm run dev
```
Open `http://localhost:5173`.

## Bonus features implemented

- **Rate limiting** — separate limiters for general API, auth, and webhook traffic
- **Role-based access control** — `owner > admin > member > viewer`, enforced in route middleware
- **Distributed locking** — `SELECT ... FOR UPDATE SKIP LOCKED` for atomic multi-worker job claiming
- **WebSocket live updates** — Socket.IO emits `job:created`/`job:updated` for API-driven changes (dashboard also polls for full cross-process coverage — see `docs/design-decisions.md` §6)
- **Workflow dependencies** — jobs can declare `dependsOn: [jobId, ...]`; the worker won't claim a job until its dependencies are `completed` (§10)
- **AI-generated failure summaries** — optional; when a job hits the Dead Letter Queue, the worker asks an LLM for a plain-English summary if `ANTHROPIC_API_KEY` is set (§11)
- **Event-driven execution** — `POST /api/webhooks/:apiKey/trigger` creates jobs from external events using a project API key, no user login required (§12)

**Not implemented:** queue sharding — see `docs/design-decisions.md` §13 for
the scaling design (why it wasn't needed here and how it would be added).

## Trying it end to end

1. Register an org at `/register`.
2. Create a **Project**, then a **Queue** inside it (e.g. `demo`, concurrency
   `3`, retry strategy `exponential`).
3. Open the queue and click **+ New job**. Try `jobType = sleep` with
   payload `{"ms": 3000}` to watch it move Queued → Claimed → Running →
   Completed, or `jobType = flaky_demo` with `{"failureRate": 0.8}` to watch
   retries and eventually the Dead Letter Queue.
4. Watch the **Workers** page for live heartbeats, and the **Overview**
   page for the throughput chart.
5. Try **+ Recurring job** with a cron expression like `*/2 * * * *` to see
   the scheduler promote it into fresh job rows every 2 minutes.

## Running backend tests

```bash
cd backend
npm install
npm test
```

## Job handlers

Worker execution logic lives in `worker/src/handlers/index.js` — a small
registry keyed by `job_type`. It ships with `noop`, `sleep`, `http_request`,
and `flaky_demo` (configurable failure rate, for exercising retry/DLQ
behavior). Add your own real handlers there for production job types.

## Environment variables

See each service's `.env.example` for the full list. The only ones you must
set for a non-Docker run are the `DB_*` credentials (same MySQL instance for
backend/worker/scheduler) and `JWT_SECRET` on the backend.
