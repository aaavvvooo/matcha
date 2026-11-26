import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { getBlockedUsers, unblockUser } from '../../api/usersApi';
import { usePageHeader } from '../../context/HeaderContext';
import { useList } from '../../hooks/useList';
import Avatar from '../../components/ui/Avatar';
import CupLoading from '../../components/ui/CupLoading';
import CupMessage from '../../components/ui/CupMessage';
import LoadError from '../../components/ui/LoadError';
import Btn from '../../components/ui/Btn';
import { displayName } from '../../utils/displayName';

export default function BlockedUsersPage() {
  const navigate = useNavigate();
  usePageHeader(useMemo(() => ({ title: 'Blocked users', onBack: () => navigate(-1) }), [navigate]));
  const { items: blocked, setItems: setBlocked, state, reload } = useList(getBlockedUsers);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [unblockError, setUnblockError] = useState(null);

  async function confirmUnblock() {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    setUnblockError(null);
    try {
      await unblockUser(target.id);
      setBlocked(prev => prev.filter(u => u.id !== target.id));
    } catch {
      setUnblockError(`Could not unblock ${displayName(target, 'this user')}. Try again.`);
    }
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-scroll">
        {unblockError && <div className="error-msg" role="alert" style={{ marginBottom: 12 }}>{unblockError}</div>}

        {state === 'loading' && (
          <CupLoading/>
        )}

        {state === 'error' && <LoadError onRetry={reload}>Couldn't load the people you blocked.</LoadError>}

        {state === 'ready' && blocked.length === 0 && (
          <CupMessage mood="happy" title="You haven't blocked anyone."/>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state === 'ready' && blocked.map(u => (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px',
              }}
            >
              {/* No photo: the photo route answers 404 for blocked pairs, which would log a console error and draw an empty circle */}
              <Avatar name={displayName(u, null)} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{displayName(u, null)}</div>
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
              Unblock {displayName(confirmTarget, null)}?
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
