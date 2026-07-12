/**
 * Job handlers. Each handler receives the job's `payload` and must return a
 * JSON-serializable result on success, or throw/reject on failure (which
 * triggers the retry / DLQ pipeline in worker.js).
 *
 * Add your own real handlers here (e.g. 'send_email', 'generate_report',
 * 'sync_crm') — this file is the single extension point for real workloads.
 */

const handlers = {
  // Generic no-op, useful for smoke-testing the pipeline end to end.
  noop: async (payload) => {
    return { ok: true, echoedPayload: payload ?? null };
  },

  // Simulates a slow job so you can watch it move Queued -> Running -> Completed.
  sleep: async (payload) => {
    const ms = Math.min(Number(payload?.ms) || 1000, 60000);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { slept_ms: ms };
  },

  // Performs a real outbound HTTP call — demonstrates a realistic I/O-bound job.
  http_request: async (payload) => {
    if (!payload?.url) throw new Error('payload.url is required for http_request jobs');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(payload.url, {
        method: payload.method || 'GET',
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return { status: res.status, ok: true };
    } finally {
      clearTimeout(timeout);
    }
  },

  // Demo handler with a configurable failure rate so retry/backoff/DLQ behavior
  // is easy to exercise without wiring up real flaky infrastructure.
  flaky_demo: async (payload) => {
    const failureRate = payload?.failureRate ?? 0.5;
    if (Math.random() < failureRate) {
      throw new Error('Simulated transient failure (flaky_demo)');
    }
    return { ok: true };
  }
};

function getHandler(jobType) {
  return handlers[jobType] || handlers.noop;
}

module.exports = { handlers, getHandler };
