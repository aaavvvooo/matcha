import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../../api/authApi';
import { confirmError, passwordError } from '../../utils/formValidation';
import { useUrlToken } from '../../hooks/useUrlToken';

function ResetPasswordPage() {
  const token = useUrlToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  if (!token) {
    return (
      <div className="status-card">
        <div className="status-card__inner">
          <span className="status-card__icon">&#10007;</span>
          <h1 className="status-card__title">Invalid link</h1>
          <p className="status-card__body">This reset link is missing a token.</p>
          <Link to="/forgot-password" className="btn btn-ghost">Request a new link</Link>
        </div>
      </div>
    );
  }

  const passwordMsg = passwordError(password);
  const confirmMsg = confirmError(password, confirm);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (passwordMsg || confirmMsg) return;
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/login');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">matcha</span>
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">Choose a new password</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="reset-password">New Password</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              aria-invalid={passwordMsg ? true : undefined}
              aria-describedby={passwordMsg ? 'reset-password-error' : undefined}
            />
            {passwordMsg && <p id="reset-password-error" className="error-msg">{passwordMsg}</p>}
            <span className="sr-only" aria-live="polite">{passwordMsg || ''}</span>
          </div>
          <div className="form-group">
            <label htmlFor="reset-confirm">Confirm Password</label>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              aria-invalid={confirmMsg ? true : undefined}
              aria-describedby={confirmMsg ? 'reset-confirm-error' : undefined}
            />
            {confirmMsg && <p id="reset-confirm-error" className="error-msg">{confirmMsg}</p>}
            <span className="sr-only" aria-live="polite">{confirmMsg || ''}</span>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordPage;
