import React from 'react';

const LABELS = {
  queued: 'Queued',
  scheduled: 'Scheduled',
  claimed: 'Claimed',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  retrying: 'Retrying',
  dead_letter: 'Dead letter',
  cancelled: 'Cancelled',
  idle: 'Idle',
  busy: 'Busy',
  offline: 'Offline'
};

export default function StatusBadge({ status }) {
  const color = `var(--status-${status}, var(--text-tertiary))`;
  const isLive = status === 'running' || status === 'busy';
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>
      <span className={`badge-dot ${isLive ? 'pulse' : ''}`} style={{ background: color }} />
      {LABELS[status] || status}
    </span>
  );
}
