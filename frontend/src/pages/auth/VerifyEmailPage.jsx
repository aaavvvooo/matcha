import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { verifyEmail } from '../../api/authApi';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setStatus('error'); return; }
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, []);

  if (status === 'verifying') {
    return (
      <div className="status-card">
        <div className="status-card__inner">
          <div className="status-card__spinner" />
          <p className="status-card__body">Verifying your email…</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="status-card">
        <div className="status-card__inner">
          <span className="status-card__icon">&#10003;</span>
          <h1 className="status-card__title">Email verified</h1>
          <p className="status-card__body">Your account is active. You can now sign in.</p>
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="status-card">
      <div className="status-card__inner">
        <span className="status-card__icon">&#10007;</span>
        <h1 className="status-card__title">Verification failed</h1>
        <p className="status-card__body">The link is invalid or has expired.</p>
        <Link to="/login" className="btn btn-ghost">Back to Sign in</Link>
      </div>
    </div>
  );
}

export default VerifyEmailPage;
