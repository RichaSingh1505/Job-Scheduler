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
job-scheduler/
│
├── database/
│   └── schema.sql              # MySQL schema (source of truth)
│
├── backend/
│   └── src/
│       ├── controllers/        # auth, projects, queues, jobs, workers, DLQ, metrics, webhooks
│       ├── models/             # SQL access layer, one per entity
│       ├── middleware/         # auth, error handling, rate limiting
│       ├── routes/             # Express routers
│       ├── services/           # Retry strategy logic
│       └── sockets/            # Socket.IO event fan-out
│
├── worker/
│   └── src/
│       ├── handlers/           # Job-type registry (noop, sleep, http_request, flaky_demo)
│       └── services/           # Optional AI failure-summary generator
│
├── scheduler/
│   └── src/
│       └── scheduler.js        # Promotes due cron definitions into jobs
│
├── frontend/
│   └── src/
│       ├── pages/              # Dashboard, Projects, QueueDetail, JobExplorer, Workers, DeadLetter
│       ├── components/         # Layout, StatusBadge, shared UI
│       └── context/            # Auth context
│
└── docs/                       # Architecture, ER diagram, API docs, design decisions

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

# Architecture Diagram

Relay is split into **four independently deployable services** that share only the **MySQL database** as their integration point.

| Service | Responsibility | Scales By |
|----------|---------------|-----------|
| **Backend** | Auth, project/queue/job CRUD, REST API, Socket.IO fan-out, metrics | Horizontally, stateless |
| **Worker** | Polls, claims, executes jobs, applies retry policy, sends heartbeats | Horizontally, any number of hosts |
| **Scheduler** | Promotes due cron definitions into job rows | 1 replica by default, safe to scale |
| **Frontend** | Operator dashboard | Static build via Nginx/CDN |
