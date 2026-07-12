import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/', label: 'Overview', exact: true },
  { to: '/projects', label: 'Projects' },
  { to: '/jobs', label: 'Job explorer' },
  { to: '/workers', label: 'Workers' },
  { to: '/dead-letter', label: 'Dead letter queue' }
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 232, flexShrink: 0, borderRight: '1px solid var(--border-soft)',
        background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', padding: '20px 14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px 26px' }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: '#06211E'
          }}>R</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-.02em' }}>Relay</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>JOB SCHEDULER</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              style={({ isActive }) => ({
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent'
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{user?.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{user?.role} · {user?.email}</div>
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => { logout(); navigate('/login'); }}>
            Sign out
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: '28px 36px', maxWidth: 1280 }}>
        {children}
      </main>
    </div>
  );
}
