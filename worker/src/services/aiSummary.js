/**
 * Optional bonus feature: when a job is permanently exhausted and moved to
 * the Dead Letter Queue, ask an LLM to turn the raw error + recent logs
 * into a short, plain-English summary an on-call engineer can scan in one
 * line instead of parsing a stack trace.
 *
 * Entirely optional: if ANTHROPIC_API_KEY is not set, this no-ops and
 * `dead_letter_queue.ai_summary` simply stays NULL. Never throws — a
 * failure to summarize a failure should never break the DLQ pipeline.
 */

let Anthropic = null;
try {
  // Lazily required so the worker still boots even if the package is
  // absent in environments that intentionally skip this optional feature.
  Anthropic = require('@anthropic-ai/sdk');
} catch {
  Anthropic = null;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
const client = process.env.ANTHROPIC_API_KEY && Anthropic
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

async function summarizeFailure({ jobType, errorMessage, recentLogs = [] }) {
  if (!client) return null;

  try {
    const logText = recentLogs.slice(-10).map((l) => `[${l.level}] ${l.message}`).join('\n');
    const prompt = `A background job of type "${jobType}" permanently failed after exhausting all retry attempts.

Final error: ${errorMessage}

Recent log lines:
${logText || '(none)'}

In 1-2 plain-English sentences, summarize what likely went wrong and, if obvious, what an engineer should check first. Do not restate the raw error verbatim — interpret it.`;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content?.find((b) => b.type === 'text')?.text;
    return text ? text.trim() : null;
  } catch (err) {
    // Best-effort only — never let a summarization failure affect the job pipeline.
    return null;
  }
}

module.exports = { summarizeFailure };
