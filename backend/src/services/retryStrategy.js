/**
 * Computes the delay (ms) before the next retry attempt, given a strategy.
 * attempt: the attempt number that just failed (1-indexed).
 */
function computeRetryDelayMs({ strategy, baseDelayMs, attempt, maxDelayMs = 300000 }) {
  let delay;
  switch (strategy) {
    case 'fixed':
      delay = baseDelayMs;
      break;
    case 'linear':
      delay = baseDelayMs * attempt;
      break;
    case 'exponential':
    default:
      delay = baseDelayMs * Math.pow(2, attempt - 1);
      break;
  }
  // Add jitter (up to 20%) to avoid thundering-herd retries across many jobs.
  const jitter = delay * 0.2 * Math.random();
  delay = Math.min(delay + jitter, maxDelayMs);
  return Math.round(delay);
}

module.exports = { computeRetryDelayMs };
