import React, { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api/client';
import { PageHeader, StatCard, Spinner } from '../components/common';

export default function Dashboard() {
  const [health, setHealth] = useState(null);
  const [throughput, setThroughput] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [h, t] = await Promise.all([
      api.get('/metrics/health'),
      api.get('/metrics/throughput', { params: { hours: 24 } })
    ]);
    setHealth(h.data.health);
    setThroughput(t.data.throughput.map((r) => ({
      bucket: r.bucket?.slice(5, 16),
      completed: Number(r.completed),
      failed: Number(r.failed)
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // live updates via polling
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <Spinner />;

  const jobs = health?.jobs || {};
  const workers = health?.workers || {};

  return (
    <div>
      <PageHeader title="Overview" subtitle="Cluster-wide health across all projects and queues." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard label="Queued" value={jobs.queued ?? 0} accent="var(--status-queued)" />
        <StatCard label="In progress" value={jobs.in_progress ?? 0} accent="var(--status-running)" />
        <StatCard label="Retrying" value={jobs.retrying ?? 0} accent="var(--status-retrying)" />
        <StatCard label="Dead letter" value={jobs.dead_letter ?? 0} accent="var(--status-dead_letter)" />
        <StatCard label="Avg duration" value={health?.avg_duration_ms ? `${Math.round(health.avg_duration_ms)}ms` : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Throughput — last 24h</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Completed vs. failed job executions per hour</div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={throughput}>
              <defs>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--status-completed)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--status-completed)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--status-failed)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--status-failed)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: 'var(--bg-panel-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="completed" stroke="var(--status-completed)" fill="url(#completedGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="failed" stroke="var(--status-failed)" fill="url(#failedGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Worker fleet</div>
          <FleetRow label="Busy" value={workers.busy ?? 0} color="var(--status-running)" />
          <FleetRow label="Idle" value={workers.idle ?? 0} color="var(--status-completed)" />
          <FleetRow label="Offline" value={workers.offline ?? 0} color="var(--status-cancelled)" />
        </div>
      </div>
    </div>
  );
}

function FleetRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value}</div>
    </div>
  );
}
