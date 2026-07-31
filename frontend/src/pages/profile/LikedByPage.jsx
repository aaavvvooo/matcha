import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle } from 'lucide-react';
import { getLikes } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/ui/Avatar';

export default function LikedByPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [likers, setLikers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getLikes(user.id)
      .then(setLikers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Who liked you</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {loading && (
          <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>Loading…</div>
        )}

        {!loading && likers.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>
            No one has liked you yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {likers.map(l => (
            <div
              key={l.id}
              onClick={() => navigate(`/profile/${l.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px', cursor: 'pointer',
              }}
            >
              <Avatar name={l.full_name || l.username} src={l.profile_photo_url} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{l.full_name || l.username}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>@{l.username}</div>
              </div>
              <Sparkle size={18} color="var(--spice)" fill="var(--spice)"/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
