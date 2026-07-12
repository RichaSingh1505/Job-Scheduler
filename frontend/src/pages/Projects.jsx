import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, EmptyState, Spinner } from '../components/common';

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => api.get('/projects').then((r) => setProjects(r.data.projects));

  useEffect(() => { load(); }, []);

  async function createProject(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/projects', form);
      setForm({ name: '', description: '' });
      setShowForm(false);
      load();
    } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Each project owns its own set of job queues."
        actions={<button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>+ New project</button>}
      />

      {showForm && (
        <form onSubmit={createProject} className="card" style={{ padding: 18, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label>Name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} placeholder="Payments backend" />
          </div>
          <div style={{ flex: 2 }}>
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} placeholder="Optional" />
          </div>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </form>
      )}

      {!projects ? <Spinner /> : projects.length === 0 ? (
        <EmptyState title="No projects yet" subtitle="Create a project to start defining queues and jobs." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {projects.map((p) => (
            <div key={p.id} className="card" style={{ padding: 18, cursor: 'pointer' }} onClick={() => navigate(`/projects/${p.id}`)}>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14, minHeight: 18 }}>{p.description || 'No description'}</div>
              <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{p.queue_count} queue{p.queue_count === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
