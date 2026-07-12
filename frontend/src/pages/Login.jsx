import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={onSubmit} className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: '#06211E'
          }}>R</div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Relay</div>
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Sign in</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 22px' }}>Access your job scheduler console.</p>

        <label>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', marginBottom: 16 }} placeholder="you@company.com" />

        <label>Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: 20 }} placeholder="••••••••" />

        {error && <div style={{ color: 'var(--status-failed)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 18, textAlign: 'center' }}>
          No account yet? <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Create one</Link>
        </p>
      </form>
    </div>
  );
}
