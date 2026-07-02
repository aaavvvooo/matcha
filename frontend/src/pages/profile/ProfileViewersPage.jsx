import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getViews } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/ui/Avatar';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProfileViewersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getViews(user.id)
      .then(setViewers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Who viewed your profile</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {loading && (
          <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>Loading…</div>
        )}

        {!loading && viewers.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>
            No one has viewed your profile yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {viewers.map(v => (
            <div
              key={v.id}
              onClick={() => navigate(`/profile/${v.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px', cursor: 'pointer',
              }}
            >
              <Avatar name={v.full_name || v.username} src={v.profile_photo_url} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{v.full_name || v.username}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>@{v.username}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic' }}>{timeAgo(v.viewed_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
