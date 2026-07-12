# Entity-Relationship Diagram

See `database/schema.sql` for the full DDL with column-level comments. This
is the logical shape of it:

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : has
    ORGANIZATIONS ||--o{ PROJECTS : has
    USERS ||--o{ PROJECTS : creates
    PROJECTS ||--o{ QUEUES : owns
    QUEUES ||--o{ JOBS : contains
    QUEUES ||--o{ RETRY_POLICIES : "default policy"
    QUEUES ||--o{ SCHEDULED_JOBS : "cron definitions"
    SCHEDULED_JOBS ||--o{ JOBS : spawns
    JOBS ||--o{ JOB_EXECUTIONS : "attempt history"
    JOBS ||--o{ JOB_LOGS : "log lines"
    JOBS ||--o| DEAD_LETTER_QUEUE : "if exhausted"
    JOB_EXECUTIONS ||--o{ JOB_LOGS : "scoped logs"
    WORKERS ||--o{ JOB_EXECUTIONS : executes
    WORKERS ||--o{ WORKER_HEARTBEATS : reports
    QUEUES ||--o{ DEAD_LETTER_QUEUE : "failed into"

    ORGANIZATIONS {
        bigint id PK
        varchar name
        varchar slug UK
    }
    USERS {
        bigint id PK
        bigint org_id FK
        varchar email
        varchar password_hash
        enum role "owner|admin|member|viewer"
    }
    PROJECTS {
        bigint id PK
        bigint org_id FK
        varchar name
        varchar api_key UK
        bigint created_by FK
    }
    QUEUES {
        bigint id PK
        bigint project_id FK
        varchar name
        int priority
        int concurrency_limit
        boolean is_paused
        enum retry_strategy "fixed|linear|exponential"
        int retry_base_delay_ms
        int max_attempts
    }
    RETRY_POLICIES {
        bigint id PK
        bigint queue_id FK
        enum strategy
        int base_delay_ms
        int max_attempts
    }
    SCHEDULED_JOBS {
        bigint id PK
        bigint queue_id FK
        varchar cron_expression
        json payload
        datetime next_run_at
        datetime last_run_at
        boolean is_active
    }
    JOBS {
        bigint id PK
        bigint queue_id FK
        bigint scheduled_job_id FK
        varchar job_type
        json payload
        enum status "scheduled|queued|claimed|running|completed|failed|retrying|dead_letter|cancelled"
        int priority
        int attempt_count
        int max_attempts
        datetime run_at
        bigint claimed_by FK
        varchar idempotency_key
        varchar batch_id
    }
    JOB_EXECUTIONS {
        bigint id PK
        bigint job_id FK
        bigint worker_id FK
        int attempt_number
        enum status "running|completed|failed"
        int duration_ms
        json result
        text error_message
    }
    JOB_LOGS {
        bigint id PK
        bigint job_id FK
        bigint execution_id FK
        enum level
        text message
    }
    WORKERS {
        bigint id PK
        varchar worker_uid UK
        enum status "idle|busy|offline"
        int concurrency
        int active_job_count
        datetime last_heartbeat_at
    }
    WORKER_HEARTBEATS {
        bigint id PK
        bigint worker_id FK
        datetime heartbeat_at
        int active_jobs
    }
    DEAD_LETTER_QUEUE {
        bigint id PK
        bigint job_id FK
        bigint queue_id FK
        text reason
        json payload_snapshot
    }
```

## Key normalization / denormalization choices

- **3NF for relational fields.** Status, priority, timestamps, foreign keys
  are all real, indexed, typed columns — never buried in JSON — because
  they're what the poll query, dashboards, and filters query on constantly.
- **JSON only for opaque, heterogeneous data.** `jobs.payload` and
  `job_executions.result` are the only JSON columns, because job payloads
  are defined by whatever the job type needs (an email job's payload looks
  nothing like a report-generation job's) and forcing that into columns
  would mean either a giant sparse table or an EAV anti-pattern.
- **`job_executions` is separate from `jobs`,** one row per attempt, so the
  full retry history (which worker ran it, how long each attempt took, what
  each attempt's error was) survives independently of the job's current
  state. `jobs` itself only carries the *current* attempt count/status.
- **`dead_letter_queue` is a distinct table**, not just a `jobs.status`
  value, so it can carry DLQ-specific metadata (a payload *snapshot* at
  time of failure, a requeued_at audit column) without polluting the hot
  `jobs` table's schema.
