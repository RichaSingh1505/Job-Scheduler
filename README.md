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
Base URL
http://localhost:4000/api
Authentication
All API routes require a JWT token in the request header except:

POST /auth/register
POST /auth/login

Header
Authorization: Bearer <token>
Authentication APIs
Method: POST — Endpoint: /auth/register — Description: Create an organization and owner user. Returns { token, user }.
Method: POST — Endpoint: /auth/login — Description: Log in and receive { token, user }.
Method: GET — Endpoint: /auth/me — Description: Returns the currently authenticated user.
Project APIs
Method: GET — Endpoint: /projects — Role: Any — Description: List all projects in your organization.
Method: POST — Endpoint: /projects — Role: Admin — Description: Create a new project (automatically generates an API key).
Method: GET — Endpoint: /projects/:id — Role: Any — Description: Get details of a specific project.
Method: PATCH — Endpoint: /projects/:id — Role: Admin — Description: Update project name or description.
Method: DELETE — Endpoint: /projects/:id — Role: Owner — Description: Delete a project (also deletes its queues and jobs).
Queue APIs
Method: GET — Endpoint: /queues/project/:projectId — Role: Any — Description: List all queues in a project with live counts.
Method: POST — Endpoint: /queues/project/:projectId — Role: Member — Description: Create a queue.
Method: GET — Endpoint: /queues/:id — Role: Any — Description: Get queue details.
Method: PATCH — Endpoint: /queues/:id — Role: Member — Description: Update concurrency, priority, and retry settings.
Method: DELETE — Endpoint: /queues/:id — Role: Admin — Description: Delete a queue (also deletes its jobs).
Method: POST — Endpoint: /queues/:id/pause — Role: Member — Description: Pause workers from claiming jobs in this queue.
Method: POST — Endpoint: /queues/:id/resume — Role: Member — Description: Resume workers for this queue.
Method: GET — Endpoint: /queues/:id/stats — Role: Any — Description: Get live job counts and completions from the last hour.
Job APIs
Method: POST — Endpoint: /queues/:queueId/jobs — Role: Member — Description: Create a job (immediate, delayed, or scheduled).
Method: POST — Endpoint: /queues/:queueId/jobs/batch — Role: Member — Description: Create many jobs atomically under one batchId.
Method: GET — Endpoint: /jobs — Role: Any — Description: List jobs. Query: queueId, status, jobType, batchId, page, pageSize.
Method: GET — Endpoint: /jobs/:id — Role: Any — Description: Get one job.
Method: GET — Endpoint: /jobs/:id/executions — Role: Any — Description: Full attempt history.
Method: GET — Endpoint: /jobs/:id/logs — Role: Any — Description: Structured log lines.
Method: GET — Endpoint: /jobs/:id/dependencies — Role: Any — Description: Workflow dependencies and their current status.
Method: POST — Endpoint: /jobs/:id/retry — Role: Member — Description: Manually retry a failed or dead_letter job (sets status back to queued).
Method: POST — Endpoint: /jobs/:id/cancel — Role: Member — Description: Cancel a queued, scheduled, or retrying job.
Job creation example (POST /queues/:queueId/jobs):
{
"jobType": "send_email",
"payload": { "to": "user@x.com" },
"priority": 5,
"runAt": "2026-07-13T09:00:00Z",
"dependsOn": [101, 102]
}
Omit runAt for an immediate job (status becomes queued right away). Pass a future timestamp for a delayed/scheduled job (status starts as scheduled). dependsOn holds the job from being claimed until every listed job id reaches status completed.
Job status transitions (as implemented by the worker):
queued/scheduled → claimed → running → completed
running → failed → retrying (if attempts remain, with a backoff delay) → claimed again directly once due → running → completed or failed again
running → failed → dead_letter (once attempt_count reaches max_attempts)
queued/scheduled/retrying → cancelled (manual, via POST /jobs/:id/cancel)
Note: a retrying job is claimed straight from the retrying status once its run_at delay elapses — it does not pass back through queued. Manually retrying a dead_letter or failed job via POST /jobs/:id/retry does explicitly reset it to queued.
The claim query also requires: the queue is not paused, the queue's concurrency_limit isn't already met by jobs in claimed/running, and no dependency is still incomplete.
Worker APIs
Method: GET — Endpoint: /workers — Description: List all workers cluster-wide with live status (auto-marks stale ones offline).
Method: GET — Endpoint: /workers/:id — Description: One worker plus its recent heartbeat history.
Worker heartbeats record active_jobs, cpu_load, and memory_mb on every ping, powering the live load view on the Workers page.
Dead Letter Queue
Method: GET — Endpoint: /dead-letter — Role: Any — Description: List permanently-failed jobs. Query: queueId, page, pageSize.
Method: POST — Endpoint: /dead-letter/:jobId/requeue — Role: Member — Description: Send the job back to queued and clear its DLQ record.
A job moves here once attempt_count reaches max_attempts. Each row includes ai_summary — a short, LLM-generated plain-English explanation of the failure, populated on a best-effort basis when the worker fleet has ANTHROPIC_API_KEY configured (never blocks the DLQ write if it fails).
Webhooks
Method: POST — Endpoint: /webhooks/:apiKey/trigger — Auth: Project api_key (no login) — Description: Create a job from an external event source.
Example:
{
"queueName": "email-notifications",
"jobType": "send_email",
"payload": { "to": "x@y.com" }
}
:apiKey is the project's api_key (visible on GET /projects/:id). Lets external systems — a Stripe webhook, an internal event bus, an outside cron — create jobs without a user login.
Trying It End-to-End
Follow these steps to test the application:

Register
Create an organization and owner account.
POST /auth/register
Create a Project
After logging in, create a project.
Create a Queue
Inside the project, create a queue.
Example:


Queue Name: demo
Concurrency: 3
Retry Strategy: Exponential


Create Jobs
Open the queue and click + New Job.

Sleep Job
{
"ms": 3000
}
Job Type:
sleep
Expected flow:
Queued
↓
Claimed
↓
Running
↓
Completed
Flaky Demo Job
{
"failureRate": 0.8
}
Job Type:
flaky_demo
Expected flow:

Retries automatically
Eventually moves to the Dead Letter Queue if retries are exhausted


Monitor Workers
Visit the Workers page to observe:


Live heartbeats
Active workers
Claimed jobs


View Dashboard
The Overview page displays:


Throughput chart
Queue statistics
Job metrics


Test Recurring Jobs
Create a recurring job using the cron expression:
*/2 * * * *
The scheduler will automatically create a new job every 2 minutes.

Running Tests
cd backend
npm install
npm test
