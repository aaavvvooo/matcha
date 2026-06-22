import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/profile/setup');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 600, color: 'var(--ink)' }}>Welcome back</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 8px' }}>
        <MatchaCup size={52} mood="happy" animate={true} style={{ animation: 'float 3s ease-in-out infinite' }}/>
      </div>

      <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '8px 24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormInput
          label="Username or email"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="you@example.com"
        />
        <FormInput
          label="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && (
          <div style={{ fontSize: 13, color: 'var(--rose)', padding: '10px 14px', background: '#fdf0f0', borderRadius: 'var(--r-sm)', border: '1px solid #f5c5c5' }}>
            {error}
          </div>
        )}
        <Btn type="submit" disabled={loading} style={{ marginTop: 8 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Btn>
        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
          <span
            onClick={() => navigate('/forgot-password')}
            style={{ color: 'var(--spice)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Forgot password?
          </span>
        </div>
      </form>

      <div style={{ padding: '12px 24px 32px', textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
        No account?{' '}
        <span onClick={() => navigate('/register')} style={{ color: 'var(--spice)', cursor: 'pointer', fontWeight: 500 }}>Register</span>
      </div>
    </div>
  );
}

export default LoginPage;
