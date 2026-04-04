import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../api/authApi';

function ForgotPasswordPage() {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(usernameOrEmail);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="status-card">
        <div className="status-card__inner">
          <span className="status-card__icon">&#9993;</span>
          <h1 className="status-card__title">Check your email</h1>
          <p className="status-card__body">If that account exists, we sent a password reset link.</p>
          <Link to="/login" className="btn btn-ghost">Back to Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="auth-logo">matcha</span>
          <h1 className="auth-title">Forgot password?</h1>
          <p className="auth-subtitle">We'll send you a reset link</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username or Email</label>
            <input
              type="text"
              placeholder="you@example.com"
              value={usernameOrEmail}
              onChange={e => setUsernameOrEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">Back to Sign in</Link>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
