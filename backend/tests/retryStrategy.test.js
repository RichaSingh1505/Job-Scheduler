const { computeRetryDelayMs } = require('../src/services/retryStrategy');

describe('computeRetryDelayMs', () => {
  test('fixed strategy returns the same base delay regardless of attempt (plus jitter)', () => {
    const d1 = computeRetryDelayMs({ strategy: 'fixed', baseDelayMs: 1000, attempt: 1 });
    const d3 = computeRetryDelayMs({ strategy: 'fixed', baseDelayMs: 1000, attempt: 3 });
    expect(d1).toBeGreaterThanOrEqual(1000);
    expect(d1).toBeLessThanOrEqual(1200);
    expect(d3).toBeGreaterThanOrEqual(1000);
    expect(d3).toBeLessThanOrEqual(1200);
  });

  test('linear strategy scales delay proportionally to attempt number', () => {
    const d1 = computeRetryDelayMs({ strategy: 'linear', baseDelayMs: 1000, attempt: 1 });
    const d2 = computeRetryDelayMs({ strategy: 'linear', baseDelayMs: 1000, attempt: 2 });
    // attempt 2 should be roughly double attempt 1 (allowing for jitter)
    expect(d2).toBeGreaterThan(d1 * 1.5);
  });

  test('exponential strategy doubles the base delay each attempt', () => {
    const d1 = computeRetryDelayMs({ strategy: 'exponential', baseDelayMs: 1000, attempt: 1 });
    const d2 = computeRetryDelayMs({ strategy: 'exponential', baseDelayMs: 1000, attempt: 2 });
    const d3 = computeRetryDelayMs({ strategy: 'exponential', baseDelayMs: 1000, attempt: 3 });
    expect(d1).toBeGreaterThanOrEqual(1000);
    expect(d1).toBeLessThanOrEqual(1200);
    expect(d2).toBeGreaterThanOrEqual(2000);
    expect(d2).toBeLessThanOrEqual(2400);
    expect(d3).toBeGreaterThanOrEqual(4000);
    expect(d3).toBeLessThanOrEqual(4800);
  });

  test('never exceeds maxDelayMs even at high attempt counts', () => {
    const d = computeRetryDelayMs({ strategy: 'exponential', baseDelayMs: 1000, attempt: 20, maxDelayMs: 30000 });
    expect(d).toBeLessThanOrEqual(30000);
  });
});
