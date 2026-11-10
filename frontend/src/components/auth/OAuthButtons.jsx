import { useEffect, useState } from 'react';
import { getOAuthProviders, oauthStartUrl } from '../../api/authApi';

// Fixed client-side labels: an id the backend reports but this map doesn't
// know is simply not rendered.
const LABELS = {
  '42': 'Continue with 42',
  github: 'Continue with GitHub',
};

const linkStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '12px 24px',
  borderRadius: 'var(--r-full)',
  background: 'var(--cream2)',
  color: 'var(--ink2)',
  border: '1.5px solid var(--sand)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  fontWeight: 500,
  textDecoration: 'none',
  transition: 'var(--transition-base)',
};

// Provider sign-in links (B1). Plain navigation to the backend, which redirects
// to the provider; no token ever passes through the page or its URL.
function OAuthButtons() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getOAuthProviders()
      .then(list => { if (!cancelled) setProviders(list.filter(id => LABELS[id])); })
      .catch(() => { if (!cancelled) setProviders([]); }); // no buttons if unavailable
    return () => { cancelled = true; };
  }, []);

  if (providers.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink4)' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--sand)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--sand)' }} />
      </div>
      {providers.map(id => (
        <a key={id} href={oauthStartUrl(id)} style={linkStyle}>
          {LABELS[id]}
        </a>
      ))}
    </div>
  );
}

export default OAuthButtons;
