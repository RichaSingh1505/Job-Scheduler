import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.orgName, form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={onSubmit} className="card" style={{ width: 380, padding: 32 }}>
        <h1 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>Create your organization</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 22px' }}>
          Sets you up as the owner with full access.
        </p>

        <label>Organization name</label>
        <input required value={form.orgName} onChange={set('orgName')} style={{ width: '100%', marginBottom: 16 }} placeholder="Acme Inc." />

        <label>Your name</label>
        <input required value={form.name} onChange={set('name')} style={{ width: '100%', marginBottom: 16 }} placeholder="Ada Lovelace" />

        <label>Email</label>
        <input type="email" required value={form.email} onChange={set('email')} style={{ width: '100%', marginBottom: 16 }} placeholder="you@company.com" />

        <label>Password</label>
        <input type="password" required minLength={8} value={form.password} onChange={set('password')} style={{ width: '100%', marginBottom: 20 }} placeholder="At least 8 characters" />

        {error && <div style={{ color: 'var(--status-failed)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}

        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? 'Creating…' : 'Create organization'}
        </button>

        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 18, textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </form>
    </div>
  );
}
