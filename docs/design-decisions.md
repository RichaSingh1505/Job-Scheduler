# Design Decisions

## 1. Atomic job claiming — the core distributed-systems problem

The single hardest correctness requirement in a job scheduler is: **when N
worker processes are polling the same queue, exactly one of them claims any
given job.** Two approaches were considered:

- **Optimistic locking** (`UPDATE jobs SET status='claimed' WHERE id=? AND
  status='queued'`, then check `affectedRows`) — simple, but wasteful: every
  worker still has to run a `SELECT` to find candidate ids, and under
  contention many workers race for the same row and only one wins, wasting
  round trips.
- **Pessimistic locking with `SELECT ... FOR UPDATE SKIP LOCKED`** (chosen) —
  each worker's poll transaction locks only the rows it's about to claim,
  and `SKIP LOCKED` means a worker never blocks waiting on a row another
  worker is already mid-claim on — it just skips to the next available one.
  This is the same primitive production systems like `pgboss`, `river`,
  and Postgres-backed Celery brokers use; MySQL 8/InnoDB supports it too.

```sql
SELECT j.id FROM jobs j
JOIN queues q ON q.id = j.queue_id
WHERE q.is_paused = 0
  AND j.status IN ('queued','retrying')
  AND j.run_at <= NOW()
  AND (SELECT COUNT(*) FROM jobs j2
       WHERE j2.queue_id = j.queue_id AND j2.status IN ('claimed','running')) < q.concurrency_limit
ORDER BY q.priority DESC, j.priority DESC, j.run_at ASC
LIMIT ?
FOR UPDATE SKIP LOCKED;
-- same transaction:
UPDATE jobs SET status='claimed', claimed_by=?, claimed_at=NOW() WHERE id IN (...);
```

This requires `READ COMMITTED` isolation (set per-connection in both the
backend and worker DB pools) — MySQL's default `REPEATABLE READ` can cause
`SKIP LOCKED` polls to see a stale snapshot and unnecessarily stall.

**Known scaling limit:** the `(SELECT COUNT(*) ...)` correlated subquery
that enforces `concurrency_limit` re-scans in-flight jobs for that queue on
every poll. At the row counts this assignment targets (thousands of jobs)
this is fine and is covered by `idx_jobs_poll`; at very large scale the
fix is a denormalized `queues.in_flight_count` counter maintained by
triggers or application-level increments/decrements, trading a bit of
consistency risk for O(1) reads.

## 2. Retry strategy: fixed / linear / exponential, with jitter

All three are implemented as pure functions
(`computeRetryDelayMs`) so they're independently unit-tested:

- `fixed`: same delay every time.
- `linear`: `base * attempt`.
- `exponential`: `base * 2^(attempt-1)`, the default, since most real
  failures (rate limits, transient network blips) recover faster the
  less aggressively you hammer them.

A random ±20% **jitter** is added to every strategy to avoid the classic
"thundering herd" problem where many jobs that failed at the same instant
(e.g. a downstream outage) all retry at the exact same instant again.

## 3. Job lifecycle state machine

```
scheduled ─▶ queued ─▶ claimed ─▶ running ─┬─▶ completed
                ▲                          │
                │                          ├─▶ retrying ─▶ (back to claimed once run_at passes)
                │                          │
                └──────────────────────────┴─▶ dead_letter   (attempts exhausted)

queued / scheduled / retrying ─▶ cancelled   (user-initiated, before it starts running)
```

`retrying` and `queued` are both eligible for the poll query — `retrying`
exists as a distinct, dashboard-visible state so operators can see "this is
failing and coming back" instead of it looking identical to a fresh job.

## 4. Dead Letter Queue as its own table, not just a status

A job that exhausts its `max_attempts` gets `jobs.status = 'dead_letter'`
**and** a row in `dead_letter_queue` carrying a `payload_snapshot` (the
payload at time of failure) and the failure `reason`. Keeping it a separate
table means DLQ-specific concerns (when was it requeued, what was the exact
snapshot) don't need extra nullable columns on the hot `jobs` table.

## 5. Worker health: heartbeats + stale sweep, not just "trust the last write"

Workers `UPDATE workers.last_heartbeat_at` and insert a `worker_heartbeats`
row every `HEARTBEAT_INTERVAL_MS` (default 5s). Two failure modes are
handled differently on purpose:

- **Graceful shutdown** (`SIGINT`/`SIGTERM`): the worker stops polling,
  drains in-flight jobs (bounded by a 30s timeout), and explicitly marks
  itself `offline` before exiting.
- **Hard crash / killed -9 / power loss**: nothing marks it offline, so the
  API's `GET /workers` route lazily runs `markStaleOffline()`, flipping any
  worker whose heartbeat is >30s old to `offline`. This means the dashboard
  never shows a zombie worker as `busy` forever.

A hard-crashed worker's *jobs* are a separate concern from the worker's own
status: they stay `claimed`/`running` until an operator retries them or (as
a documented extension point) a periodic reaper job requeues jobs whose
`claimed_at` is older than a timeout with no matching live worker.

## 6. Why polling for dashboard live-updates instead of pure WebSockets

The backend does run Socket.IO and emits events for actions that happen
*through the API* (creating/retrying/cancelling a job). But the worker
fleet — where most state changes actually happen (claim → running →
completed/retrying) — is a separate process pool with no socket connection
to the backend, and this project deliberately avoids adding a message
broker (see architecture.md §"Why a shared database"). Rather than build a
partial, misleading "live" experience where only some transitions show up
in real time, the dashboard polls REST endpoints every 3-5 seconds
uniformly. This is simple, always-consistent with the database, and — per
the assignment brief — an explicitly acceptable choice ("live updates via
polling or WebSockets").

## 7. Multi-tenancy: org → project → queue → job

Every table down to `jobs` is reachable from `organizations` through a
foreign-key chain, and every API query joins through that chain (e.g.
`jobs JOIN queues JOIN projects WHERE projects.org_id = ?`) rather than
trusting a `org_id` copied onto every table. This trades a bit of query
verbosity for a schema with a single source of truth for tenancy — no risk
of a stale/forged `org_id` on a deeply nested row.

## 8. RBAC

Four roles (`owner > admin > member > viewer`) with a simple numeric-rank
comparison in middleware (`requireRole('member')` etc.), enforced in routes
rather than scattered through controllers, so the permission model for each
endpoint is visible at a glance in `backend/src/routes/*.js`.

## 9. Idempotent job creation

`jobs` has a `UNIQUE(queue_id, idempotency_key)` constraint. Producers that
might retry their own "create job" call on network failure can pass a
stable `idempotencyKey`; a duplicate insert is turned into a no-op that
returns the original row (`ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`)
instead of creating a second job.

## 10. Bonus feature: workflow dependencies

`job_dependencies(job_id, depends_on_job_id)` is a plain edge table — a job
can depend on any number of other jobs. Rather than add a new `blocked`
status (which would mean updating it on every dependency's completion, an
extra write on the hot path), the worker's atomic claim query simply adds
`AND NOT EXISTS (... dep.status <> 'completed')`. A job with unmet
dependencies just never gets selected by the poll query — it stays
`queued` and is picked up the moment its last dependency completes, with
zero extra bookkeeping. **Known limitation:** if a dependency itself ends
up in `dead_letter`, the dependent job waits forever rather than being
auto-cancelled or auto-escalated — a deliberate simplicity trade-off,
called out here rather than hidden. A production version would add a
sweep that cancels or DLQs jobs whose dependency has been dead-lettered.

## 11. Bonus feature: AI-generated failure summaries

When a job exhausts its retries and moves to the Dead Letter Queue, the
worker (`worker/src/services/aiSummary.js`) makes a best-effort call to the
Anthropic API with the error message and last 10 log lines, asking for a
1-2 sentence plain-English summary, stored in
`dead_letter_queue.ai_summary`. This is entirely optional: with no
`ANTHROPIC_API_KEY` set, the function returns `null` immediately and the
DLQ pipeline behaves exactly as it does without this feature — a
summarization failure or timeout is caught and swallowed rather than ever
blocking or failing the job pipeline itself.

## 12. Bonus feature: event-driven execution

`POST /api/webhooks/:apiKey/trigger` lets an external system (a webhook
from a payment provider, an internal event bus, a cron outside this
system) create a job by presenting a project's `api_key` instead of a user
JWT — this is what makes job creation "event-driven" rather than only
reachable from an authenticated dashboard user. It's intentionally a thin
wrapper around the exact same `jobModel.create` the authenticated API uses
(same idempotency-key support, same validation), just with API-key auth
and its own tighter rate limit (120/min) since it's reachable without a
login.

## 13. Not implemented: queue sharding (scaling note)

Queue sharding — splitting a single logical queue's jobs across multiple
physical tables or database instances so no one table/host becomes the
throughput ceiling — was deliberately **not implemented**. At the scale
this assignment targets (a single MySQL instance, a handful of worker
processes), the existing `idx_jobs_poll(queue_id, status, run_at, priority)`
index keeps the atomic-claim query fast well past the point where sharding
would matter, and adding a routing layer without a real load problem to
solve would be premature complexity. If throughput ever did become
bottlenecked on a single `jobs` table, the intended path is:

1. **Shard by `queue_id` hash** across N physical databases (or N MySQL
   partitions via `PARTITION BY KEY(queue_id)`), so a given queue's jobs
   always live on the same shard and the atomic-claim transaction never
   needs to span shards.
2. Each worker process is configured with a shard connection pool instead
   of one global pool, and the `WORKER_QUEUES` filter (already supported)
   naturally maps a worker to the shard(s) that own its queues.
3. Cross-shard concerns — the dashboard's global `GET /jobs` search/filter,
   and `GET /metrics/*` — become fan-out queries across shards with an
   in-memory merge, the same pattern used for the existing single-shard
   aggregation queries in `metricsModel.js`.
4. `workers`/`worker_heartbeats` stay on a single "control plane" database
   shared by all shards, since fleet-wide worker visibility is a small
   amount of data and doesn't benefit from sharding.

This keeps the sharding boundary at the queue level (a queue's jobs never
split across shards), which avoids the hardest version of this problem —
cross-shard transactions — entirely.

## 14. Testing strategy

Given time constraints, tests focus on the parts with the highest
correctness risk and the least dependency on a live database:
- `retryStrategy.test.js` — pure-function unit tests for all three retry
  strategies and the max-delay cap.
- `auth.test.js` — controller-level tests with the user model mocked via
  `jest.mock`, covering validation, duplicate-email, and success paths
  without needing MySQL running in CI.
- `health.test.js` — route-level smoke tests (404 handling, auth
  middleware rejecting missing/invalid tokens).

Extending this to full integration tests against a real MySQL instance
(e.g. via `testcontainers` or a docker-compose test profile) is a natural
next step and is called out here rather than faked.
