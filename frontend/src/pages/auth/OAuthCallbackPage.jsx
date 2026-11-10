import { useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// The backend redirects here with only `status` or `error` from a fixed set.
// Messages come from this map; URL text is never rendered.
const ERROR_MESSAGES = {
  access_denied: 'Sign-in was cancelled.',
  invalid_state: 'This sign-in link expired or was already used. Please try again.',
  provider_error: 'The provider could not complete the sign-in. Please try again.',
  no_email: 'Your provider account has no verified primary email address we can use.',
  email_in_use: 'An account already uses this email. Sign in with your password instead.',
  link_unverified: 'An account with this email exists but its email is not verified yet. Verify it with the link we sent, or sign in with your password, then try again.',
  already_linked: 'Your Matcha account is already linked to a different account at this provider.',
  email_unverified: 'Please verify your email with the link we sent you, then sign in again.',
  email_unavailable: 'We can’t send the verification email right now. Please try again later.',
  server_error: 'Something went wrong. Please try again.',
  session_failed: 'We couldn’t start your session. Please try again.',
};

function StatusCard({ icon, title, body }) {
  return (
    <div className="status-card">
      <div className="status-card__inner">
        {icon && <span className="status-card__icon">{icon}</span>}
        <h1 className="status-card__title">{title}</h1>
        <p className="status-card__body">{body}</p>
        <Link to="/login" className="btn btn-ghost">Back to Sign in</Link>
      </div>
    </div>
  );
}

function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // AuthProvider restores the session on page load via POST /auth/refresh,
  // which carries the refresh cookie the OAuth callback just set. Reusing that
  // result avoids a second, racing refresh of the same rotating cookie.
  const { user, loading } = useAuth();

  const status = searchParams.get('status');
  const error = searchParams.get('error');
  const signedIn = status === 'ok' && !loading && user;

  useEffect(() => {
    if (signedIn) navigate(user.has_profile ? '/browse' : '/profile/setup', { replace: true });
  }, [signedIn, user, navigate]);

  if (status === 'ok') {
    if (loading || user) {
      return (
        <div className="status-card">
          <div className="status-card__inner">
            <div className="status-card__spinner" />
            <p className="status-card__body">Signing you in…</p>
          </div>
        </div>
      );
    }
    return <StatusCard icon={"\u2717"} title="Sign-in failed" body={ERROR_MESSAGES.session_failed} />;
  }

  if (status === 'verify_email') {
    return (
      <StatusCard
        icon={"\u2709"}
        title="Check your email"
        body="Your account was created. We sent you a verification link — click it, then sign in again."
      />
    );
  }

  const message = Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, error)
    ? ERROR_MESSAGES[error]
    : ERROR_MESSAGES.server_error;
  return <StatusCard icon={"\u2717"} title="Sign-in failed" body={message} />;
}

export default OAuthCallbackPage;
