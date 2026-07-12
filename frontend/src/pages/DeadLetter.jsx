import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, EmptyState, Spinner, Pagination, timeAgo } from '../components/common';

export default function DeadLetter() {
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/dead-letter', { params: { page, pageSize: 20 } });
    setResult(data);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function requeue(jobId) {
    setBusyId(jobId);
    try { await api.post(`/dead-letter/${jobId}/requeue`); await load(); } finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader title="Dead letter queue" subtitle="Jobs that exhausted every retry attempt. Inspect and requeue as needed." />

      {!result ? <Spinner /> : result.rows.length === 0 ? (
        <EmptyState title="Dead letter queue is empty" subtitle="Permanently failed jobs will show up here." />
      ) : (
        <>
          <div className="card">
            <table className="table">
              <thead><tr><th>Job</th><th>Type</th><th>Attempts</th><th>Reason</th><th>AI summary</th><th>Failed</th><th></th></tr></thead>
              <tbody>
                {result.rows.map((d) => (
                  <tr key={d.id}>
                    <td><Link to={`/jobs/${d.job_id}`} style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>#{d.job_id}</Link></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{d.job_type}</td>
                    <td>{d.attempt_count}/{d.max_attempts}</td>
                    <td style={{ color: 'var(--status-failed)', fontSize: 12.5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.reason}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 280 }}>
                      {d.ai_summary || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{timeAgo(d.failed_at)}</td>
                    <td><button className="btn btn-sm btn-primary" disabled={busyId === d.job_id} onClick={() => requeue(d.job_id)}>Requeue</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
