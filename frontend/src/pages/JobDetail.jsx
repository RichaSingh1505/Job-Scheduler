import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, Spinner } from '../components/common';
import StatusBadge from '../components/StatusBadge';

export default function JobDetail() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [j, e, l, d] = await Promise.all([
      api.get(`/jobs/${id}`),
      api.get(`/jobs/${id}/executions`),
      api.get(`/jobs/${id}/logs`),
      api.get(`/jobs/${id}/dependencies`)
    ]);
    setJob(j.data.job);
    setExecutions(e.data.executions);
    setLogs(l.data.logs);
    setDependencies(d.data.dependencies);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);

  async function retry() {
    setBusy(true);
    try { await api.post(`/jobs/${id}/retry`); await load(); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true);
    try { await api.post(`/jobs/${id}/cancel`); await load(); } finally { setBusy(false); }
  }

  if (!job) return <Spinner />;

  const canRetry = ['failed', 'dead_letter'].includes(job.status);
  const canCancel = ['queued', 'scheduled', 'retrying'].includes(job.status);

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        <Link to="/jobs" style={{ color: 'var(--text-tertiary)' }}>Job explorer</Link> <span style={{ color: 'var(--text-tertiary)' }}>/</span> Job #{job.id}
      </div>
      <PageHeader
        title={<span style={{ fontFamily: 'var(--font-mono)' }}>#{job.id} · {job.job_type}</span>}
        subtitle={<StatusBadge status={job.status} />}
        actions={<>
          {canRetry && <button className="btn btn-primary btn-sm" disabled={busy} onClick={retry}>Retry</button>}
          {canCancel && <button className="btn btn-danger btn-sm" disabled={busy} onClick={cancel}>Cancel</button>}
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <InfoCard title="Lifecycle">
          <Row label="Attempts" value={`${job.attempt_count} / ${job.max_attempts}`} />
          <Row label="Retry strategy" value={`${job.retry_strategy} (${job.retry_base_delay_ms}ms base)`} />
          <Row label="Priority" value={job.priority} />
          <Row label="Run at" value={job.run_at} mono />
          <Row label="Claimed at" value={job.claimed_at || '—'} mono />
          <Row label="Started at" value={job.started_at || '—'} mono />
          <Row label="Completed at" value={job.completed_at || '—'} mono />
        </InfoCard>
        <InfoCard title="Payload & error">
          <pre style={{ fontSize: 12, background: 'var(--bg-panel-raised)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 120 }}>
            {job.payload ? JSON.stringify(typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload, null, 2) : '(no payload)'}
          </pre>
          {job.last_error && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--status-failed)', fontFamily: 'var(--font-mono)' }}>{job.last_error}</div>
          )}
        </InfoCard>
      </div>

      {dependencies.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Workflow dependencies</div>
          <div className="card" style={{ padding: 14, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {dependencies.map((d) => (
              <Link key={d.job_id} to={`/jobs/${d.job_id}`} className="card" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>#{d.job_id} · {d.job_type}</span>
                <StatusBadge status={d.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Execution history</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <table className="table">
          <thead><tr><th>Attempt</th><th>Status</th><th>Worker</th><th>Duration</th><th>Started</th><th>Error</th></tr></thead>
          <tbody>
            {executions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>No executions yet</td></tr>}
            {executions.map((e) => (
              <tr key={e.id}>
                <td>{e.attempt_number}</td>
                <td><StatusBadge status={e.status === 'completed' ? 'completed' : e.status === 'failed' ? 'failed' : 'running'} /></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>#{e.worker_id ?? '—'}</td>
                <td>{e.duration_ms ? `${e.duration_ms}ms` : '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.started_at}</td>
                <td style={{ color: 'var(--status-failed)', fontSize: 12 }}>{e.error_message || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Logs</div>
      <div className="card" style={{ padding: 14, maxHeight: 320, overflow: 'auto' }}>
        {logs.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 12.5 }}>No log lines yet</div>}
        {logs.map((l) => (
          <div key={l.id} style={{ display: 'flex', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <span style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>{l.created_at}</span>
            <span style={{
              color: l.level === 'error' ? 'var(--status-failed)' : l.level === 'warn' ? 'var(--status-retrying)' : 'var(--text-secondary)',
              flexShrink: 0, textTransform: 'uppercase', fontWeight: 700, width: 40
            }}>{l.level}</span>
            <span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 12 : 13 }}>{value}</span>
    </div>
  );
}
