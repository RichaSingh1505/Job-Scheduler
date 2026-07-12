import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, EmptyState, Spinner, Pagination, timeAgo } from '../components/common';
import StatusBadge from '../components/StatusBadge';

const STATUSES = ['', 'queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'retrying', 'dead_letter', 'cancelled'];

export default function JobExplorer() {
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [jobType, setJobType] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    const { data } = await api.get('/jobs', { params: { status: status || undefined, jobType: jobType || undefined, page, pageSize: 20 } });
    setResult(data);
  }, [status, jobType, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  return (
    <div>
      <PageHeader title="Job explorer" subtitle="Search and inspect jobs across every project and queue." />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace('_', ' ') : 'All statuses'}</option>)}
        </select>
        <input placeholder="Filter by job type…" value={jobType} onChange={(e) => { setJobType(e.target.value); setPage(1); }} />
      </div>

      {!result ? <Spinner /> : result.rows.length === 0 ? (
        <EmptyState title="No jobs match these filters" />
      ) : (
        <>
          <div className="card">
            <table className="table">
              <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Priority</th><th>Attempts</th><th>Created</th><th>Updated</th></tr></thead>
              <tbody>
                {result.rows.map((j) => (
                  <tr key={j.id}>
                    <td><Link to={`/jobs/${j.id}`} style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>#{j.id}</Link></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{j.job_type}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td>{j.priority}</td>
                    <td>{j.attempt_count}/{j.max_attempts}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{timeAgo(j.created_at)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{timeAgo(j.updated_at)}</td>
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
