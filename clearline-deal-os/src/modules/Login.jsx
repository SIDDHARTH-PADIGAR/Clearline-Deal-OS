import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const reset = () => { setError(null); setSuccess(null); setEmail(''); setPassword(''); setConfirm(''); };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) { setError(error.message); }
    else {
      setSuccess('Account created. Check your email to confirm, then sign in.');
      setMode('signin'); reset();
    }
    setLoading(false);
  };

  const isSignIn = mode === 'signin';

  return (
    <div className="loading-screen" style={{ flexDirection: 'column' }}>
      <div className="card" style={{ width: '340px', textAlign: 'center' }}>

        {/* Wordmark */}
        <div style={{ fontFamily: 'var(--serif)', fontSize: '20px', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
          Clearline Capital
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '24px' }}>
          Deal Operating System
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '20px', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
          {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setMode(id); reset(); }}
              style={{
                flex: 1, padding: '7px 0',
                fontFamily: 'DM Mono, monospace', fontSize: '10px', letterSpacing: '0.06em',
                border: 'none', cursor: 'pointer',
                background: mode === id ? 'var(--amber)' : 'var(--navy3)',
                color: mode === id ? 'var(--navy)' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >{label}</button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={isSignIn ? handleSignIn : handleSignUp} style={{ textAlign: 'left' }}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete={isSignIn ? 'current-password' : 'new-password'} />
          </div>
          {!isSignIn && (
            <div className="field">
              <label>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ justifyContent: 'center', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : isSignIn ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {error   && <div className="error-msg" style={{ marginTop: '12px' }}>{error}</div>}
        {success && (
          <div style={{ marginTop: '12px', fontFamily: 'DM Mono, monospace', fontSize: '10px', color: 'var(--green)', background: 'rgba(34,197,94,0.08)', border: '1px solid var(--green)', borderRadius: '3px', padding: '8px 10px', lineHeight: 1.6 }}>
            {success}
          </div>
        )}

        {/* Footer note */}
        <div style={{ marginTop: '16px', fontFamily: 'DM Mono, monospace', fontSize: '9px', color: 'var(--muted)', lineHeight: 1.6 }}>
          {isSignIn
            ? 'Your deals and pipeline are private to your account.'
            : 'Each account is fully isolated. Your data is never shared with other users.'}
        </div>
      </div>
    </div>
  );
}
