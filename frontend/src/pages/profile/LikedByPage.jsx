import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkle } from 'lucide-react';
import { getLikes } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import { usePageHeader } from '../../context/HeaderContext';
import { useList } from '../../hooks/useList';
import Avatar from '../../components/ui/Avatar';
import CupLoading from '../../components/ui/CupLoading';
import CupMessage from '../../components/ui/CupMessage';
import LoadError from '../../components/ui/LoadError';
import { displayName } from '../../utils/displayName';

export default function LikedByPage() {
  const navigate = useNavigate();
  usePageHeader(useMemo(() => ({ title: 'Who liked you', onBack: () => navigate(-1) }), [navigate]));
  const { user } = useAuth();
  const userId = user?.id;
  const load = useMemo(() => (userId ? () => getLikes(userId) : null), [userId]);
  const { items: likers, state, reload } = useList(load);

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-scroll">
        {state === 'loading' && (
          <CupLoading/>
        )}

        {state === 'error' && <LoadError onRetry={reload}>Couldn't load who liked you.</LoadError>}

        {state === 'ready' && likers.length === 0 && (
          <CupMessage mood="shy" title="No one has liked you yet."/>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state === 'ready' && likers.map(l => (
            <Link
              key={l.id}
              to={`/profile/${l.id}`}
              className="list-card"
              style={{
                color: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px', cursor: 'pointer',
              }}
            >
              <Avatar name={displayName(l, null)} src={l.profile_photo_url} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{displayName(l, null)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>@{l.username}</div>
              </div>
              <Sparkle size={18} color="var(--spice)" fill="var(--spice)"/>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
