import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { getBlockedUsers, unblockUser } from '../../api/usersApi';
import Avatar from '../../components/ui/Avatar';
import Btn from '../../components/ui/Btn';

export default function BlockedUsersPage() {
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => {
    getBlockedUsers()
      .then(setBlocked)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function confirmUnblock() {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    try {
      await unblockUser(target.id);
      setBlocked(prev => prev.filter(u => u.id !== target.id));
    } catch {}
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>Blocked users</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {loading && (
          <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>Loading…</div>
        )}

        {!loading && blocked.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 48 }}>
            <UserX size={40} strokeWidth={1.5} color="var(--ink4)"/>
            <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic' }}>You haven't blocked anyone.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocked.map(u => (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px',
              }}
            >
              <Avatar name={u.full_name || u.username} src={u.profile_photo_url} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{u.full_name || u.username}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>@{u.username}</div>
              </div>
              <Btn variant="ghost" onClick={() => setConfirmTarget(u)} style={{ fontSize: 12, padding: '6px 12px' }}>Unblock</Btn>
            </div>
          ))}
        </div>
      </div>

      {confirmTarget && (
        <div
          onClick={() => setConfirmTarget(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '24px 22px',
              maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 14, textAlign: 'center', boxShadow: 'var(--shadow-lg)',
            }}
          >
            <UserX size={36} strokeWidth={1.5} color="var(--ink3)"/>
            <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>
              Unblock {confirmTarget.full_name || confirmTarget.username}?
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink4)' }}>
              They'll be able to view your profile, like you, and message you again.
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 4 }}>
              <Btn variant="secondary" onClick={() => setConfirmTarget(null)} style={{ flex: 1 }}>Cancel</Btn>
              <Btn variant="primary" onClick={confirmUnblock} style={{ flex: 1 }}>Unblock</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
