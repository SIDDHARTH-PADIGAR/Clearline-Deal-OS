import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="loading-screen" style={{ flexDirection: 'column' }}>
      <div className="card" style={{ width: '320px', textAlign: 'center' }}>
        <div className="wordmark" style={{ fontFamily: 'var(--serif)', fontSize: '20px', color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Clearline Capital</div>
        <div className="sub" style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)', marginBottom: '24px' }}>Deal Operating System</div>
        
        <form onSubmit={handleLogin} style={{ textAlign: 'left' }}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', marginTop: '8px' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In'}
          </button>
        </form>
        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
