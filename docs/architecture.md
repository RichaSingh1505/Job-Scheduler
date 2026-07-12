# Architecture

## System overview

Relay is split into four independently deployable services that share only
the MySQL database as their integration point. This mirrors how a real
distributed job scheduler (Sidekiq, Celery, BullMQ, Temporal) is composed,
and is what makes the "distributed" part of the assignment real rather than
simulated: you can run zero, one, or twenty worker processes, on any number
of machines, and they coordinate purely through row-level locking in MySQL.

```
                                   ┌─────────────────────┐
                                   │   React Dashboard    │
                                   │   (Vite, port 5173)  │
                                   └──────────┬───────────┘
                                              │ REST + Socket.IO (JWT)
                                              ▼
                                   ┌─────────────────────┐
                     ┌────────────▶│   Backend API        │
                     │  REST/API   │   (Express, :4000)   │
                     │             └──────────┬───────────┘
                     │                        │
              ┌──────┴───────┐                │ SQL
              │  Producers /  │                │
              │  external apps│                ▼
              └───────────────┘      ┌───────────────────┐
                                      │      MySQL          │◀──────────────┐
                                      │  (single source of  │               │
                                      │   truth / locking)  │               │
                                      └─────────┬───────────┘               │
                                                 │ SQL (SELECT..FOR UPDATE   │
                                                 │      SKIP LOCKED)         │
                              ┌──────────────────┼───────────────────┐      │
                              ▼                  ▼                   ▼      │
                      ┌──────────────┐   ┌──────────────┐   ┌──────────────┐│
                      │  Worker #1    │   │  Worker #2    │   │  Worker #N   ││
                      │ poll / claim  │   │ poll / claim  │   │ poll / claim ││
                      │ execute / hb  │   │ execute / hb  │   │ execute / hb ││
                      └──────────────┘   └──────────────┘   └──────────────┘│
                                                                             │
                                      ┌───────────────────┐                 │
                                      │  Scheduler service │─────────────────┘
                                      │  (cron promoter)    │
                                      └───────────────────┘
```

## Services

| Service | Responsibility | Scales by |
|---|---|---|
| **backend** (`/backend`) | Auth, project/queue/job CRUD, REST API, pagination/filtering, Socket.IO event fan-out, metrics aggregation | Horizontally, stateless — put behind any load balancer |
| **worker** (`/worker`) | Polls eligible queues, atomically claims jobs, executes them via a pluggable handler registry, records executions/logs, applies retry policy, moves exhausted jobs to the Dead Letter Queue, sends heartbeats | Horizontally — start as many processes as you want, on as many hosts as you want |
| **scheduler** (`/scheduler`) | Evaluates `scheduled_jobs` cron definitions and promotes due ones into concrete `jobs` rows | Runs as 1 replica for simplicity; the promotion query already uses `SKIP LOCKED` so it is safe to run more than one for HA |
| **frontend** (`/frontend`) | Operator dashboard: queue health, worker fleet, job explorer, execution/log inspection, DLQ management, throughput charts | Static build served by Nginx/CDN |

## Why a shared database instead of a message broker

Given the assignment's emphasis on **database design** as a first-class
evaluation criterion, the scheduler intentionally uses MySQL itself as the
coordination point (via `SELECT ... FOR UPDATE SKIP LOCKED`) rather than
introducing Redis/RabbitMQ/Kafka as a second source of truth. This:

- keeps the job's full lifecycle, retry history, and logs queryable with
  plain SQL instead of split across a queue and a database,
- avoids dual-write inconsistency between a broker and the database,
- and is a legitimate, widely-used production pattern (this is essentially
  how Postgres-backed queues like `pgboss` or `river` work; the same
  technique is used here on MySQL/InnoDB).

The trade-off — documented in `design-decisions.md` — is that MySQL's polling
throughput ceiling is lower than a purpose-built broker's push-based model.
For the scale this assignment targets, polling every 1.5s with indexed
queries comfortably supports thousands of jobs/minute per worker.

## Request flow: creating and running a job

1. A producer calls `POST /api/queues/:queueId/jobs` on the backend.
2. The backend validates the queue belongs to the caller's org, inserts a row
   into `jobs` with `status = 'queued'` (or `'scheduled'` if `runAt` is in
   the future), and emits a `job:created` Socket.IO event to the org's room.
3. Every `POLL_INTERVAL_MS`, each running worker process executes the atomic
   claim query (see `design-decisions.md` for the exact SQL) inside a single
   transaction: it selects up to N eligible job ids with
   `FOR UPDATE SKIP LOCKED`, then immediately `UPDATE`s them to
   `status = 'claimed'` before committing. This is what guarantees
   **exactly-one-worker-claims-a-job** even with many workers polling in
   parallel.
4. The worker executes the job via `worker/src/handlers/index.js`, writing a
   `job_executions` row and streaming `job_logs` lines as it goes.
5. On success → `status = 'completed'`. On failure → if attempts remain, the
   retry delay is computed from the queue's strategy (fixed/linear/
   exponential with jitter) and the job returns to `status = 'retrying'`
   with a future `run_at`; once exhausted, it moves to `status = 'dead_letter'`
   and a row is written to `dead_letter_queue`.
6. The dashboard reflects all of this via 3-5 second polling of the REST API
   (see `design-decisions.md` for why polling was chosen as the primary
   mechanism over WebSockets for cross-process updates).

## Recurring (cron) jobs

`scheduled_jobs` holds the cron *definition* (queue, job type, payload, cron
expression). The `scheduler` service is the only writer to this table's
`next_run_at`/`last_run_at` — every `CHECK_INTERVAL_MS` it selects due
definitions, inserts a fresh row into `jobs` for each one, and advances
`next_run_at` using `cron-parser`. This keeps "define a recurring job" and
"a single job instance's lifecycle" as two clean, separately-queryable
concerns instead of overloading the `jobs` table with cron semantics.

## Graceful shutdown

Each worker listens for `SIGINT`/`SIGTERM`, immediately stops polling for
new work, waits (bounded by a 30s timeout) for its in-flight jobs to finish
via `Promise.allSettled`, marks itself `offline` in the `workers` table, and
exits. This means a rolling deploy of the worker fleet does not kill jobs
mid-execution or leave them stuck in `claimed`/`running` forever — see
`design-decisions.md` for the stale-worker sweep that also protects against
a hard-crashed (not gracefully shut down) worker.
