-- =====================================================================
-- Distributed Job Scheduler — MySQL Schema
-- Engine: InnoDB (required for row-level locking / FOREIGN KEY support)
-- Charset: utf8mb4
-- =====================================================================

CREATE DATABASE IF NOT EXISTS job_scheduler
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE job_scheduler;

SET default_storage_engine = InnoDB;

-- ---------------------------------------------------------------------
-- ORGANIZATIONS
-- ---------------------------------------------------------------------
CREATE TABLE organizations (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  slug          VARCHAR(150) NOT NULL UNIQUE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id          BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('owner','admin','member','viewer') NOT NULL DEFAULT 'member',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_users_email_org (org_id, email),
  KEY idx_users_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PROJECTS  (a project belongs to an org, owns many queues)
-- ---------------------------------------------------------------------
CREATE TABLE projects (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id        BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150) NOT NULL,
  description   VARCHAR(500) NULL,
  api_key       VARCHAR(64) NOT NULL UNIQUE,
  created_by    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_projects_org_name (org_id, name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- QUEUES
-- ---------------------------------------------------------------------
CREATE TABLE queues (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id         BIGINT UNSIGNED NOT NULL,
  name               VARCHAR(150) NOT NULL,
  priority           INT NOT NULL DEFAULT 0,          -- higher = served first
  concurrency_limit  INT NOT NULL DEFAULT 5,           -- max jobs running in parallel for this queue
  is_paused          TINYINT(1) NOT NULL DEFAULT 0,
  max_attempts       INT NOT NULL DEFAULT 3,
  retry_strategy     ENUM('fixed','linear','exponential') NOT NULL DEFAULT 'exponential',
  retry_base_delay_ms INT NOT NULL DEFAULT 5000,
  retry_max_delay_ms  INT NOT NULL DEFAULT 300000,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_queues_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE KEY uq_queues_project_name (project_id, name),
  KEY idx_queues_project (project_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- RETRY_POLICIES (optional per-job override of a queue's default policy)
-- ---------------------------------------------------------------------
CREATE TABLE retry_policies (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  queue_id        BIGINT UNSIGNED NULL,     -- NULL when this is a one-off/job-level policy
  name            VARCHAR(100) NOT NULL,
  strategy        ENUM('fixed','linear','exponential') NOT NULL DEFAULT 'exponential',
  base_delay_ms   INT NOT NULL DEFAULT 5000,
  max_delay_ms    INT NOT NULL DEFAULT 300000,
  max_attempts    INT NOT NULL DEFAULT 3,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_retry_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  KEY idx_retry_queue (queue_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SCHEDULED_JOBS (recurring / cron job definitions -> spawn rows in `jobs`)
-- ---------------------------------------------------------------------
CREATE TABLE scheduled_jobs (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  queue_id          BIGINT UNSIGNED NOT NULL,
  name              VARCHAR(150) NOT NULL,
  job_type          VARCHAR(100) NOT NULL,
  cron_expression   VARCHAR(100) NOT NULL,
  payload           JSON NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  next_run_at       DATETIME NULL,
  last_run_at       DATETIME NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sched_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  KEY idx_sched_active_next (is_active, next_run_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- JOBS  (the central work-item table)
-- ---------------------------------------------------------------------
CREATE TABLE jobs (
  id                 BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  queue_id           BIGINT UNSIGNED NOT NULL,
  scheduled_job_id   BIGINT UNSIGNED NULL,        -- set if spawned from a recurring definition
  batch_id           VARCHAR(64) NULL,            -- groups jobs created together in a batch
  idempotency_key    VARCHAR(150) NULL,           -- de-dupe safety for producers
  job_type           VARCHAR(100) NOT NULL,
  payload            JSON NULL,
  priority           INT NOT NULL DEFAULT 0,
  status             ENUM('scheduled','queued','claimed','running','completed',
                           'failed','retrying','dead_letter','cancelled')
                     NOT NULL DEFAULT 'queued',
  attempt_count      INT NOT NULL DEFAULT 0,
  max_attempts       INT NOT NULL DEFAULT 3,
  retry_strategy     ENUM('fixed','linear','exponential') NOT NULL DEFAULT 'exponential',
  retry_base_delay_ms INT NOT NULL DEFAULT 5000,
  run_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,  -- earliest eligible execution time
  claimed_by         BIGINT UNSIGNED NULL,        -- worker id
  claimed_at         DATETIME NULL,
  started_at         DATETIME NULL,
  completed_at       DATETIME NULL,
  last_error         TEXT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_jobs_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  CONSTRAINT fk_jobs_scheduled FOREIGN KEY (scheduled_job_id) REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  UNIQUE KEY uq_jobs_idempotency (queue_id, idempotency_key),
  -- Composite index is the core of the atomic-claim poll query:
  -- WHERE status='queued' AND run_at <= NOW() ORDER BY priority DESC, run_at ASC
  KEY idx_jobs_poll (queue_id, status, run_at, priority),
  KEY idx_jobs_status (status),
  KEY idx_jobs_batch (batch_id),
  KEY idx_jobs_claimed_by (claimed_by)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- JOB_DEPENDENCIES  (workflow dependencies: a job can wait on others)
-- ---------------------------------------------------------------------
CREATE TABLE job_dependencies (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id              BIGINT UNSIGNED NOT NULL,       -- the dependent job
  depends_on_job_id   BIGINT UNSIGNED NOT NULL,       -- must reach 'completed' first
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dep_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_on FOREIGN KEY (depends_on_job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE KEY uq_job_dependency (job_id, depends_on_job_id),
  KEY idx_dep_depends_on (depends_on_job_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- WORKERS
-- ---------------------------------------------------------------------
CREATE TABLE workers (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  worker_uid         VARCHAR(100) NOT NULL UNIQUE,  -- stable generated id e.g. hostname-pid-random
  hostname           VARCHAR(150) NULL,
  pid                INT NULL,
  status             ENUM('idle','busy','offline') NOT NULL DEFAULT 'idle',
  concurrency        INT NOT NULL DEFAULT 5,
  active_job_count   INT NOT NULL DEFAULT 0,
  queues             VARCHAR(500) NULL,             -- comma separated queue names this worker polls
  last_heartbeat_at  DATETIME NULL,
  started_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stopped_at         DATETIME NULL,
  KEY idx_workers_status (status),
  KEY idx_workers_heartbeat (last_heartbeat_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- WORKER_HEARTBEATS  (time-series log of health pings)
-- ---------------------------------------------------------------------
CREATE TABLE worker_heartbeats (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  worker_id      BIGINT UNSIGNED NOT NULL,
  heartbeat_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_jobs    INT NOT NULL DEFAULT 0,
  cpu_load       DECIMAL(5,2) NULL,
  memory_mb      DECIMAL(10,2) NULL,
  CONSTRAINT fk_heartbeat_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  KEY idx_heartbeat_worker_time (worker_id, heartbeat_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- JOB_EXECUTIONS  (one row per attempt of a job)
-- ---------------------------------------------------------------------
CREATE TABLE job_executions (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id           BIGINT UNSIGNED NOT NULL,
  worker_id        BIGINT UNSIGNED NULL,
  attempt_number   INT NOT NULL,
  status           ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  started_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at      DATETIME NULL,
  duration_ms      INT NULL,
  result           JSON NULL,
  error_message    TEXT NULL,
  CONSTRAINT fk_exec_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_exec_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE SET NULL,
  KEY idx_exec_job (job_id),
  KEY idx_exec_worker (worker_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- JOB_LOGS  (structured execution log lines, many per execution)
-- ---------------------------------------------------------------------
CREATE TABLE job_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id         BIGINT UNSIGNED NOT NULL,
  execution_id   BIGINT UNSIGNED NULL,
  level          ENUM('debug','info','warn','error') NOT NULL DEFAULT 'info',
  message        TEXT NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_execution FOREIGN KEY (execution_id) REFERENCES job_executions(id) ON DELETE CASCADE,
  KEY idx_logs_job (job_id, created_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- DEAD_LETTER_QUEUE  (permanently failed jobs, kept for inspection/replay)
-- ---------------------------------------------------------------------
CREATE TABLE dead_letter_queue (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id              BIGINT UNSIGNED NOT NULL,
  queue_id            BIGINT UNSIGNED NOT NULL,
  last_execution_id   BIGINT UNSIGNED NULL,
  reason              TEXT NULL,
  ai_summary          TEXT NULL,           -- optional LLM-generated plain-English failure summary
  payload_snapshot    JSON NULL,
  failed_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requeued_at         DATETIME NULL,
  CONSTRAINT fk_dlq_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_dlq_queue FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
  KEY idx_dlq_queue (queue_id)
) ENGINE=InnoDB;

-- =====================================================================
-- Notes on design decisions (see docs/design-decisions.md for full detail)
-- =====================================================================
-- 1. Atomic claim: worker polls jobs with
--      SELECT id FROM jobs WHERE queue_id=? AND status='queued' AND run_at<=NOW()
--      ORDER BY priority DESC, run_at ASC LIMIT ? FOR UPDATE SKIP LOCKED;
--    then UPDATEs the fetched ids to status='claimed'. SKIP LOCKED lets many
--    worker processes poll the same queue concurrently without blocking on
--    each other or double-claiming a row (requires InnoDB + READ COMMITTED
--    or a short explicit transaction).
-- 2. Soft-normalized JSON payload columns (jobs.payload, execution.result)
--    avoid an explosion of sparse columns for heterogeneous job types while
--    keeping all relational/query-heavy fields (status, run_at, priority)
--    as real indexed columns.
-- 3. ON DELETE CASCADE from project -> queue -> job -> execution/log keeps
--    referential integrity when a project is removed; workers/heartbeats
--    are cluster-wide and not cascaded from project deletion.
-- 4. Composite index idx_jobs_poll(queue_id, status, run_at, priority)
--    is the single most important index — it is what the poll query above
--    uses to avoid a full table scan as the jobs table grows.
