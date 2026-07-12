# API Documentation

Base URL: `http://localhost:4000/api`
Auth: `Authorization: Bearer <token>` on every route except `/auth/register` and `/auth/login`.
All bodies/responses are JSON.

## Auth

### `POST /auth/register`
Creates a new organization and its owner user in one step.
```json
{ "orgName": "Acme Inc.", "name": "Ada Lovelace", "email": "ada@acme.com", "password": "at-least-8-chars" }
```
→ `201 { token, user }`

### `POST /auth/login`
```json
{ "email": "ada@acme.com", "password": "..." }
```
→ `200 { token, user }`

### `GET /auth/me`
→ `200 { user }`

## Projects

| Method | Path | Role required | Description |
|---|---|---|---|
| GET | `/projects` | any | List projects in your org |
| POST | `/projects` | admin | Create a project (auto-generates an `api_key`) |
| GET | `/projects/:id` | any | Get one project |
| PATCH | `/projects/:id` | admin | Update name/description |
| DELETE | `/projects/:id` | owner | Delete a project (cascades queues/jobs) |

## Queues

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/queues/project/:projectId` | any | List queues in a project, with live counts |
| POST | `/queues/project/:projectId` | member | Create a queue |
| GET | `/queues/:id` | any | Get one queue |
| PATCH | `/queues/:id` | member | Update concurrency/priority/retry defaults |
| DELETE | `/queues/:id` | admin | Delete a queue (cascades jobs) |
| POST | `/queues/:id/pause` | member | Stop workers from claiming new jobs from this queue |
| POST | `/queues/:id/resume` | member | Resume claiming |
| GET | `/queues/:id/stats` | any | Live counts per status + completions in the last hour |

Create queue body:
```json
{
  "name": "email-notifications",
  "priority": 10,
  "concurrencyLimit": 5,
  "maxAttempts": 3,
  "retryStrategy": "exponential",
  "retryBaseDelayMs": 5000,
  "retryMaxDelayMs": 300000
}
```

## Jobs

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/queues/:queueId/jobs` | member | Create a job (immediate / delayed / scheduled) |
| POST | `/queues/:queueId/jobs/batch` | member | Create many jobs atomically, tagged with a shared `batchId` |
| GET | `/jobs` | any | List jobs. Query: `queueId, status, jobType, batchId, page, pageSize` |
| GET | `/jobs/:id` | any | Get one job |
| GET | `/jobs/:id/executions` | any | Full attempt history |
| GET | `/jobs/:id/logs` | any | Structured log lines |
| GET | `/jobs/:id/dependencies` | any | Workflow dependencies and their current status |
| POST | `/jobs/:id/retry` | member | Manually retry a `failed`/`dead_letter` job |
| POST | `/jobs/:id/cancel` | member | Cancel a `queued`/`scheduled`/`retrying` job |

Create job body — **immediate** (default):
```json
{ "jobType": "send_email", "payload": { "to": "user@x.com" }, "priority": 5 }
```
**Delayed / scheduled** — pass a future ISO timestamp:
```json
{ "jobType": "send_email", "payload": {}, "runAt": "2026-07-13T09:00:00Z" }
```
**Workflow dependencies (bonus)** — pass `dependsOn` as an array of job ids;
the worker will never claim this job until every id in the list has reached
`status = 'completed'`:
```json
{ "jobType": "generate_invoice", "payload": {}, "dependsOn": [101, 102] }
```
**Idempotent creation** — pass `idempotencyKey`; a duplicate key within the
same queue returns the existing job instead of creating a second one.

Batch body:
```json
{ "jobs": [ { "jobType": "resize_image", "payload": { "id": 1 } }, { "jobType": "resize_image", "payload": { "id": 2 } } ] }
```

## Recurring (cron) jobs

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/queues/:queueId/scheduled-jobs` | any | List cron definitions for a queue |
| POST | `/queues/:queueId/scheduled-jobs` | member | Create a cron definition |
| PATCH | `/scheduled-jobs/:id/toggle` | member | `{ "isActive": false }` to pause it |
| DELETE | `/scheduled-jobs/:id` | member | Delete a cron definition |

```json
{ "name": "nightly-cleanup", "jobType": "cleanup_temp_files", "cronExpression": "0 2 * * *", "payload": {} }
```

## Workers

| Method | Path | Description |
|---|---|---|
| GET | `/workers` | List all workers cluster-wide with live status (auto-marks stale ones `offline`) |
| GET | `/workers/:id` | One worker + its recent heartbeat history |

## Event-driven job creation (bonus)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhooks/:apiKey/trigger` | project `api_key` (no user JWT) | Create a job from an external event source |

```json
{ "queueName": "email-notifications", "jobType": "send_email", "payload": { "to": "x@y.com" }, "priority": 0 }
```
`:apiKey` is the project's `api_key` (visible on the project detail page /
`GET /projects/:id`). This lets external systems — a Stripe webhook, an
internal event bus, a cron outside this system — create jobs without a
user login. Rate-limited separately (120 req/min) since it's reachable
without auth beyond the key.

## Dead Letter Queue

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/dead-letter` | any | List permanently-failed jobs. Query: `queueId, page, pageSize` |
| POST | `/dead-letter/:jobId/requeue` | member | Send the job back to `queued` and clear its DLQ record |

Each row also includes `ai_summary` (bonus feature) — a short LLM-generated
plain-English explanation of the failure, populated automatically if the
worker fleet has `ANTHROPIC_API_KEY` configured; otherwise `null`.

## Metrics

| Method | Path | Description |
|---|---|---|
| GET | `/metrics/throughput?hours=24` | Hourly completed vs. failed counts for charting |
| GET | `/metrics/health` | Cluster snapshot: job counts by status, worker counts by status, avg execution duration |

## Live updates

The backend also runs a Socket.IO gateway on the same port. Clients connect
with `{ auth: { token } }` and are joined to an `org:<orgId>` room; the
backend emits `job:created`, `job:batch_created`, and `job:updated` events
there whenever those actions happen **through the API**. Because the worker
fleet is a separate process pool with no direct socket connection to the
backend, the dashboard's live views (queue stats, job explorer, worker fleet)
poll the REST endpoints every 3-5 seconds as the primary, reliable
cross-process update mechanism — see `design-decisions.md`.

## Error format

All errors: `{ "error": "message", "details": { ... } | undefined }` with an
appropriate HTTP status (400 validation, 401 auth, 403 role, 404 not found,
409 conflict, 429 rate limited, 500 unexpected).

## Rate limits

- General API: 300 requests/minute per IP.
- `/auth/*`: 20 requests/15 minutes per IP.
