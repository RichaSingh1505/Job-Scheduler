import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { PageHeader, EmptyState, Spinner, timeAgo } from '../components/common';
import StatusBadge from '../components/StatusBadge';

export default function Workers() {
  const [workers, setWorkers] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get('/workers');
    setWorkers(data.workers);
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  if (!workers) return <Spinner />;

  return (
    <div>
      <PageHeader title="Workers" subtitle="Live heartbeat and concurrency across the worker fleet." />

      {workers.length === 0 ? (
        <EmptyState title="No workers registered" subtitle="Start a worker process (see /worker in the repo) to see it appear here." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {workers.map((w) => (
            <Link key={w.id} to={`#`} className="card" style={{ padding: 18, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{w.worker_uid}</div>
                <StatusBadge status={w.status} />
              </div>
              <PulseStrip active={w.status !== 'offline'} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14, fontSize: 12.5 }}>
                <Metric label="Active jobs" value={`${w.active_job_count} / ${w.concurrency}`} />
                <Metric label="Host" value={w.hostname || '—'} />
                <Metric label="PID" value={w.pid ?? '—'} />
                <Metric label="Last heartbeat" value={timeAgo(w.last_heartbeat_at)} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Signature element: a seismograph-style pulse strip evoking a heartbeat trace.
function PulseStrip({ active }) {
  const bars = 28;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
      {[...Array(bars)].map((_, i) => {
        const h = active ? 6 + Math.abs(Math.sin(i * 0.9)) * 20 : 4;
        return (
          <div key={i} style={{
            width: 3, height: h, borderRadius: 2,
            background: active ? 'var(--accent)' : 'var(--border)',
            opacity: active ? 0.35 + (i / bars) * 0.65 : 0.5,
            animation: active ? `pulse ${1 + (i % 5) * 0.15}s ease-in-out infinite` : 'none'
          }} />
        );
      })}
    </div>
  );
}
