import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, StatCard, Spinner, EmptyState, timeAgo } from '../components/common';
import StatusBadge from '../components/StatusBadge';

export default function QueueDetail() {
  const { id } = useParams();
  const [queue, setQueue] = useState(null);
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [scheduledJobs, setScheduledJobs] = useState([]);
  const [tab, setTab] = useState('jobs');
  const [showJobForm, setShowJobForm] = useState(false);
  const [showCronForm, setShowCronForm] = useState(false);
  const [jobForm, setJobForm] = useState({ jobType: 'noop', payload: '{}', priority: 0, delayMinutes: 0, dependsOn: '' });
  const [cronForm, setCronForm] = useState({ name: '', jobType: 'noop', cronExpression: '*/5 * * * *', payload: '{}' });

  const load = useCallback(async () => {
    const [q, s, j, sc] = await Promise.all([
      api.get(`/queues/${id}`),
      api.get(`/queues/${id}/stats`),
      api.get('/jobs', { params: { queueId: id, pageSize: 20 } }),
      api.get(`/queues/${id}/scheduled-jobs`)
    ]);
    setQueue(q.data.queue);
    setStats(s.data.stats);
    setJobs(j.data.rows);
    setScheduledJobs(sc.data.scheduledJobs);
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [load]);

  async function createJob(e) {
    e.preventDefault();
    let payload;
    try { payload = JSON.parse(jobForm.payload || '{}'); } catch { payload = {}; }
    const runAt = jobForm.delayMinutes > 0
      ? new Date(Date.now() + jobForm.delayMinutes * 60000).toISOString()
      : undefined;
    const dependsOn = jobForm.dependsOn
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    await api.post(`/queues/${id}/jobs`, { jobType: jobForm.jobType, payload, priority: Number(jobForm.priority), runAt, dependsOn });
    setShowJobForm(false);
    load();
  }

  async function createCron(e) {
    e.preventDefault();
    let payload;
    try { payload = JSON.parse(cronForm.payload || '{}'); } catch { payload = {}; }
    await api.post(`/queues/${id}/scheduled-jobs`, { ...cronForm, payload });
    setShowCronForm(false);
    load();
  }

  if (!queue) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        <Link to={`/projects/${queue.project_id}`} style={{ color: 'var(--text-tertiary)' }}>Project</Link> <span style={{ color: 'var(--text-tertiary)' }}>/</span> {queue.name}
      </div>
      <PageHeader
        title={queue.name}
        subtitle={`Priority ${queue.priority} · Concurrency ${queue.concurrency_limit} · Retry: ${queue.retry_strategy} (base ${queue.retry_base_delay_ms}ms, max ${queue.max_attempts} attempts)`}
        actions={<>
          <button className="btn" onClick={() => setShowCronForm((s) => !s)}>+ Recurring job</button>
          <button className="btn btn-primary" onClick={() => setShowJobForm((s) => !s)}>+ New job</button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 22 }}>
        <StatCard label="Queued" value={stats?.queued ?? 0} accent="var(--status-queued)" />
        <StatCard label="Scheduled" value={stats?.scheduled ?? 0} accent="var(--status-scheduled)" />
        <StatCard label="In progress" value={stats?.in_progress ?? 0} accent="var(--status-running)" />
        <StatCard label="Retrying" value={stats?.retrying ?? 0} accent="var(--status-retrying)" />
        <StatCard label="Completed (1h)" value={stats?.completed_last_hour ?? 0} accent="var(--status-completed)" />
        <StatCard label="Dead letter" value={stats?.dead_letter ?? 0} accent="var(--status-dead_letter)" />
      </div>

      {showJobForm && (
        <form onSubmit={createJob} className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label>Job type</label>
              <input value={jobForm.jobType} onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value })} style={{ width: '100%' }} placeholder="e.g. send_email" />
            </div>
            <div>
              <label>Priority</label>
              <input type="number" value={jobForm.priority} onChange={(e) => setJobForm({ ...jobForm, priority: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Delay (minutes, 0 = immediate)</label>
              <input type="number" min={0} value={jobForm.delayMinutes} onChange={(e) => setJobForm({ ...jobForm, delayMinutes: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Payload (JSON)</label>
              <input value={jobForm.payload} onChange={(e) => setJobForm({ ...jobForm, payload: e.target.value })} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Depends on job IDs (comma-separated, optional — workflow dependency)</label>
            <input value={jobForm.dependsOn} onChange={(e) => setJobForm({ ...jobForm, dependsOn: e.target.value })} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} placeholder="e.g. 101, 102" />
          </div>
          <button className="btn btn-primary" type="submit">Create job</button>
        </form>
      )}

      {showCronForm && (
        <form onSubmit={createCron} className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label>Name</label>
              <input required value={cronForm.name} onChange={(e) => setCronForm({ ...cronForm, name: e.target.value })} style={{ width: '100%' }} placeholder="nightly-cleanup" />
            </div>
            <div>
              <label>Job type</label>
              <input value={cronForm.jobType} onChange={(e) => setCronForm({ ...cronForm, jobType: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Cron expression</label>
              <input value={cronForm.cronExpression} onChange={(e) => setCronForm({ ...cronForm, cronExpression: e.target.value })} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
            </div>
            <div>
              <label>Payload (JSON)</label>
              <input value={cronForm.payload} onChange={(e) => setCronForm({ ...cronForm, payload: e.target.value })} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
            </div>
          </div>
          <button className="btn btn-primary" type="submit">Create recurring job</button>
        </form>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        <TabBtn active={tab === 'jobs'} onClick={() => setTab('jobs')}>Recent jobs</TabBtn>
        <TabBtn active={tab === 'cron'} onClick={() => setTab('cron')}>Recurring ({scheduledJobs.length})</TabBtn>
      </div>

      {tab === 'jobs' ? (
        !jobs ? <Spinner /> : jobs.length === 0 ? <EmptyState title="No jobs yet" subtitle="Create one above to see it move through the lifecycle." /> : (
          <div className="card">
            <table className="table">
              <thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Attempts</th><th>Run at</th><th>Updated</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td><Link to={`/jobs/${j.id}`} style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>#{j.id}</Link></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{j.job_type}</td>
                    <td><StatusBadge status={j.status} /></td>
                    <td>{j.attempt_count}/{j.max_attempts}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{timeAgo(j.run_at)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{timeAgo(j.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        scheduledJobs.length === 0 ? <EmptyState title="No recurring jobs" subtitle="Add a cron schedule above to spawn jobs automatically." /> : (
          <div className="card">
            <table className="table">
              <thead><tr><th>Name</th><th>Type</th><th>Cron</th><th>Next run</th><th>Last run</th><th>Active</th></tr></thead>
              <tbody>
                {scheduledJobs.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.job_type}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.cron_expression}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.next_run_at ? timeAgo(s.next_run_at) : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{s.last_run_at ? timeAgo(s.last_run_at) : 'never'}</td>
                    <td>{s.is_active ? <span style={{ color: 'var(--status-completed)' }}>Yes</span> : <span style={{ color: 'var(--text-tertiary)' }}>No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="btn btn-sm" style={{
      background: active ? 'var(--bg-hover)' : 'transparent',
      borderColor: active ? 'var(--border)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)'
    }}>{children}</button>
  );
}
