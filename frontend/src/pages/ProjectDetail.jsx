import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, EmptyState, Spinner } from '../components/common';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [queues, setQueues] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', priority: 0, concurrencyLimit: 5, maxAttempts: 3,
    retryStrategy: 'exponential', retryBaseDelayMs: 5000
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [p, q] = await Promise.all([
      api.get(`/projects/${id}`),
      api.get(`/queues/project/${id}`)
    ]);
    setProject(p.data.project);
    setQueues(q.data.queues);
  };

  useEffect(() => { load(); }, [id]);

  async function createQueue(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/queues/project/${id}`, form);
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  async function togglePause(q) {
    await api.post(`/queues/${q.id}/${q.is_paused ? 'resume' : 'pause'}`);
    load();
  }

  if (!project) return <Spinner />;

  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        <Link to="/projects" style={{ color: 'var(--text-tertiary)' }}>Projects</Link> <span style={{ color: 'var(--text-tertiary)' }}>/</span> {project.name}
      </div>
      <PageHeader
        title={project.name}
        subtitle={project.description || `API key: ${project.api_key}`}
        actions={<button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>+ New queue</button>}
      />

      {showForm && (
        <form onSubmit={createQueue} className="card" style={{ padding: 18, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <div>
              <label>Queue name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} placeholder="email-notifications" />
            </div>
            <div>
              <label>Priority</label>
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Concurrency limit</label>
              <input type="number" min={1} value={form.concurrencyLimit} onChange={(e) => setForm({ ...form, concurrencyLimit: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Max attempts</label>
              <input type="number" min={1} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
            <div>
              <label>Retry strategy</label>
              <select value={form.retryStrategy} onChange={(e) => setForm({ ...form, retryStrategy: e.target.value })} style={{ width: '100%' }}>
                <option value="fixed">Fixed</option>
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
              </select>
            </div>
            <div>
              <label>Base retry delay (ms)</label>
              <input type="number" min={0} value={form.retryBaseDelayMs} onChange={(e) => setForm({ ...form, retryBaseDelayMs: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>
          </div>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create queue'}</button>
        </form>
      )}

      {!queues ? <Spinner /> : queues.length === 0 ? (
        <EmptyState title="No queues yet" subtitle="Create a queue to start accepting jobs for this project." />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Queue</th><th>Priority</th><th>Concurrency</th><th>Queued</th><th>Running</th><th>Completed</th><th>Dead letter</th><th>State</th><th></th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.id} onClick={() => navigate(`/queues/${q.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{q.name}</td>
                  <td>{q.priority}</td>
                  <td>{q.concurrency_limit}</td>
                  <td>{q.queued_count}</td>
                  <td>{q.running_count}</td>
                  <td>{q.completed_count}</td>
                  <td style={{ color: q.dead_letter_count > 0 ? 'var(--status-dead_letter)' : undefined }}>{q.dead_letter_count}</td>
                  <td>{q.is_paused ? <span style={{ color: 'var(--status-claimed)' }}>Paused</span> : <span style={{ color: 'var(--status-completed)' }}>Active</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => togglePause(q)}>{q.is_paused ? 'Resume' : 'Pause'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
