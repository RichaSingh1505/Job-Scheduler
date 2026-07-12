# Relay — Distributed Job Scheduler
A production-shaped distributed job scheduling platform built with **Node.js + Express (API)**, a horizontally scalable worker fleet, a cron-based scheduler, and a **React (Vite)** dashboard — all coordinated through **MySQL** using atomic row-level locking, so no job is ever double-processed even with many workers running at once.

# Features
- **Distributed Job Claiming** — Workers atomically claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`, so dozens of worker replicas can run in parallel with zero double-processing.
- **Configurable Retry Strategies** — Fixed, linear, or exponential backoff per queue, with a Dead Letter Queue for jobs that exhaust their retries.
- **Recurring / Cron Jobs** — A dedicated scheduler service promotes due cron definitions into real job rows.
- **Workflow Dependencies** — Jobs can declare `dependsOn: [jobId, ...]`; a worker won't claim a job until its dependencies are completed.
- **Role-Based Access Control** — `owner > admin > member > viewer`, enforced across every route.
- **Event-Driven Job Creation** — External systems can create jobs via a webhook scoped to a project API key, no login required.
- **Live Operator Dashboard** — Queue health, worker heartbeats, job explorer, execution/log inspection, DLQ management, and throughput charts, updated via Socket.IO.
- **Rate Limiting** — Separate limits for general API, auth, and webhook traffic.
- **Optional AI Failure Summaries** — When a job lands in the Dead Letter Queue, the worker can ask an LLM for a plain-English summary of what went wrong.

# Tech Stack
| Layer | Technology |
|--------|------------|
| **Backend API** | Node.js, Express, Socket.IO, JWT Authentication |
| **Worker** | Node.js, mysql2, pluggable job-handler registry, optional @anthropic-ai/sdk |
| **Scheduler** | Node.js, cron-parser, mysql2 |
| **Frontend** | React 18, Vite, React Router, Recharts, Axios |
| **Database** | MySQL (`SELECT ... FOR UPDATE SKIP LOCKED` for atomic claiming) |
| **Authentication** | JWT (`jsonwebtoken`), password hashing via `bcryptjs` |
| **Testing** | Jest, Supertest |
| **Logging** | Winston |
| **Deployment** | Docker, Docker Compose, Nginx |

# Project Structure
<img width="915" height="607" alt="image" src="https://github.com/user-attachments/assets/ea955f00-2904-418b-9118-e78bcacae39a" />

# How the Scheduling Logic Works
## Job Lifecycle
Every job moves through a fixed set of states as workers pick it up and run it.
| Status | Meaning |
|--------|---------|
| `queued` | Waiting to be claimed |
| `claimed` | Picked up by a worker, not yet running |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `retrying` | Failed, waiting for the next retry attempt |
| `dead_letter` | Exhausted all retries |
| `cancelled` | Manually cancelled |

## Retry Strategy
The retry engine calculates the next delay based on the queue's configured strategy:
- **Fixed** → Same delay every retry.
- **Linear** → Delay grows by a fixed step each attempt.
- **Exponential** → Delay doubles each attempt, up to a maximum cap.

## Recurring Jobs
The scheduler service evaluates `scheduled_jobs` cron expressions every cycle and promotes any that are due into fresh rows in the `jobs` table — using the same `SKIP LOCKED` pattern, so it's safe to run more than one scheduler replica.

# Getting Started
## Prerequisites
- Node.js (v18+)
- MySQL (local or hosted)
- Docker + Docker Compose (optional, for the one-command setup) or can be done manually.

## 1. Clone the Repository
git clone https://github.com/your-username/job-scheduler.git
cd job-scheduler

## 2. Fastest Option — Docker
docker compose up --build

This starts:

- MySQL (schema auto-loaded)
- Backend on **:4000**
- Two worker replicas
- Scheduler
- Dashboard on **:5173**

## 3. Manual Setup — MySQL
mysql -u root -p < database/schema.sql

## 4. Manual Setup — Backend
cd backend

cp .env.example .env      # edit DB_* and JWT_SECRET

npm install

npm run dev

Runs on **http://localhost:4000**

Health check:
GET /health

## 5. Manual Setup — Worker
cd worker

cp .env.example .env

npm install

npm start

Run this in multiple terminals to see distributed claiming in action.

## 6. Manual Setup — Scheduler
cd scheduler

cp .env.example .env

npm install

npm start

## 7. Manual Setup — Frontend
cd frontend

cp .env.example .env      # VITE_API_URL=http://localhost:4000

npm install

npm run dev

Open: http://localhost:5173

**Screens Overview**
<img width="1920" height="973" alt="image" src="https://github.com/user-attachments/assets/f33f14aa-7491-47ca-945a-13cc61d1942b" />
<img width="1918" height="966" alt="image" src="https://github.com/user-attachments/assets/10e70b85-cdfc-4098-95b3-e45cacbae21b" />
<img width="1920" height="969" alt="image" src="https://github.com/user-attachments/assets/b2891c0b-47c0-4839-b7f6-5f5fec3b7d61" />
<img width="1920" height="968" alt="image" src="https://github.com/user-attachments/assets/668c687f-abb3-4b90-8307-1c7b610fbc52" />

# Architecture Diagram

Relay is split into **four independently deployable services** that share only the **MySQL database** as their integration point.
<img width="611" height="741" alt="image" src="https://github.com/user-attachments/assets/4f7a9a52-f1aa-4d5f-8dde-2912b95e97ec" />

| Service | Responsibility | Scales By |
|----------|---------------|-----------|
| **Backend** | Auth, project/queue/job CRUD, REST API, Socket.IO fan-out, metrics | Horizontally, stateless |
| **Worker** | Polls, claims, executes jobs, applies retry policy, sends heartbeats | Horizontally, any number of hosts |
| **Scheduler** | Promotes due cron definitions into job rows | 1 replica by default, safe to scale |
| **Frontend** | Operator dashboard | Static build via Nginx/CDN |

**ER Diagram**
<img width="1668" height="822" alt="image" src="https://github.com/user-attachments/assets/9568410e-758c-41af-9f72-7cd44aff79ca" />

# Verified. Here's the corrected version, matching the zip exactly:

**API Documentation**
# API Documentation

## Base URL

```
http://localhost:4000/api
```

## Authentication

All API routes require a JWT token in the request header except:

- `POST /auth/register`
- `POST /auth/login`

### Header

```http
Authorization: Bearer <token>
```

---

# Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create an organization and owner user. Returns `{ token, user }`. |
| POST | `/auth/login` | Log in and receive `{ token, user }`. |
| GET | `/auth/me` | Returns the currently authenticated user. |

---

# Project APIs

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/projects` | Any | List all projects in your organization. |
| POST | `/projects` | Admin | Create a new project (automatically generates an API key). |
| GET | `/projects/:id` | Any | Get details of a specific project. |
| PATCH | `/projects/:id` | Admin | Update project name or description. |
| DELETE | `/projects/:id` | Owner | Delete a project (also deletes its queues and jobs). |

---

# Queue APIs

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/queues/project/:projectId` | Any | List all queues in a project with live counts. |
| POST | `/queues/project/:projectId` | Member | Create a queue. |
| GET | `/queues/:id` | Any | Get queue details. |
| PATCH | `/queues/:id` | Member | Update concurrency, priority, and retry settings. |
| DELETE | `/queues/:id` | Admin | Delete a queue (also deletes its jobs). |
| POST | `/queues/:id/pause` | Member | Pause workers from claiming jobs in this queue. |
| POST | `/queues/:id/resume` | Member | Resume workers for this queue. |
| GET | `/queues/:id/stats` | Any | Get live job counts and completions from the last hour. |

---

# Job APIs

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST | `/queues/:queueId/jobs` | Member | Create a job (immediate, delayed, or scheduled). |
| POST | `/queues/:queueId/jobs/batch` | Member | Create many jobs atomically under one `batchId`. |
| GET | `/jobs` | Any | List jobs. Supports `queueId`, `status`, `jobType`, `batchId`, `page`, `pageSize`. |
| GET | `/jobs/:id` | Any | Get a single job. |
| GET | `/jobs/:id/executions` | Any | View full execution history. |
| GET | `/jobs/:id/logs` | Any | View structured log lines. |
| GET | `/jobs/:id/dependencies` | Any | View workflow dependencies and their status. |
| POST | `/jobs/:id/retry` | Member | Retry a failed or dead-letter job. Status resets to `queued`. |
| POST | `/jobs/:id/cancel` | Member | Cancel a queued, scheduled, or retrying job. |

---

# Job Creation Example

**POST** `/queues/:queueId/jobs`

```json
{
  "jobType": "send_email",
  "payload": {
    "to": "user@x.com"
  },
  "priority": 5,
  "runAt": "2026-07-13T09:00:00Z",
  "dependsOn": [101, 102]
}
```

### Notes

- Omit `runAt` for an immediate job.
- Provide a future timestamp for a scheduled or delayed job.
- `dependsOn` prevents execution until all referenced jobs have reached the `completed` state.

---

# Job Status Lifecycle

## Standard Execution

```
queued / scheduled
        │
        ▼
     claimed
        │
        ▼
     running
        │
        ▼
    completed
```

## Retry Flow

```
running
   │
   ▼
failed
   │
   ▼
retrying
   │
   ▼
claimed
   │
   ▼
running
```

If all retry attempts are exhausted:

```
running
   │
   ▼
failed
   │
   ▼
dead_letter
```

Manual cancellation:

```
queued / scheduled / retrying
             │
             ▼
         cancelled
```

### Important Notes

- Retrying jobs are claimed directly once their backoff delay expires.
- They do **not** return to the `queued` state.
- Manual retries using `POST /jobs/:id/retry` reset the job status back to `queued`.
- Jobs can only be claimed when:
  - The queue is not paused.
  - The concurrency limit has not been reached.
  - All dependencies have completed.

---

# Worker APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workers` | List all workers cluster-wide with live status. Offline workers are detected automatically. |
| GET | `/workers/:id` | View worker details and recent heartbeat history. |

Worker heartbeats record:

- Active jobs
- CPU load
- Memory usage (MB)

This information powers the live Workers dashboard.

---

# Dead Letter Queue APIs

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/dead-letter` | Any | List permanently failed jobs. Supports `queueId`, `page`, and `pageSize`. |
| POST | `/dead-letter/:jobId/requeue` | Member | Requeue a dead-letter job and clear its DLQ record. |

### AI Failure Summary

When `ANTHROPIC_API_KEY` is configured, each dead-letter record includes an `ai_summary`, providing a concise explanation of why the job failed.

If AI summarization fails, the dead-letter entry is still created.

---

# Webhook API

| Method | Endpoint | Authentication | Description |
|--------|----------|----------------|-------------|
| POST | `/webhooks/:apiKey/trigger` | Project API Key | Trigger jobs from external systems without user authentication. |

### Example

```json
{
  "queueName": "email-notifications",
  "jobType": "send_email",
  "payload": {
    "to": "x@y.com"
  }
}
```

This endpoint allows external services such as:

- Stripe Webhooks
- Internal Event Buses
- Third-party Cron Services
- Custom Applications

to enqueue jobs using the project's API key.

---

# Trying It End-to-End

## 1. Register

Create an organization and owner account.

```http
POST /auth/register
```

---

## 2. Create a Project

After logging in, create a project.

---

## 3. Create a Queue

Example configuration:

| Setting | Value |
|----------|-------|
| Queue Name | `demo` |
| Concurrency | `3` |
| Retry Strategy | `Exponential` |

---

## 4. Create Jobs

Open the queue and select **New Job**.

### Sleep Job

Job Type:

```
sleep
```

Payload

```json
{
  "ms": 3000
}
```

Expected execution:

```
Queued
   ↓
Claimed
   ↓
Running
   ↓
Completed
```

---

### Flaky Demo Job

Job Type:

```
flaky_demo
```

Payload

```json
{
  "failureRate": 0.8
}
```

Expected behavior:

- Retries automatically
- Uses exponential backoff
- Moves to the Dead Letter Queue after exhausting retries

---

## 5. Monitor Workers

The Workers page displays:

- Live worker heartbeats
- Worker status
- Active jobs
- Claimed jobs
- CPU usage
- Memory usage

---

## 6. View Dashboard

The Overview page includes:

- Throughput chart
- Queue statistics
- Job metrics
- System activity

---

## 7. Test Recurring Jobs

Use the following cron expression:

```cron
*/2 * * * *
```

A new scheduled job will be created automatically every **2 minutes**.

---

# Running Tests

```bash
cd backend
npm install
npm test
```
