import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getViews } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import { usePageHeader } from '../../context/HeaderContext';
import { useList } from '../../hooks/useList';
import Avatar from '../../components/ui/Avatar';
import CupLoading from '../../components/ui/CupLoading';
import CupMessage from '../../components/ui/CupMessage';
import LoadError from '../../components/ui/LoadError';
import { displayName } from '../../utils/displayName';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProfileViewersPage() {
  const navigate = useNavigate();
  usePageHeader(useMemo(() => ({ title: 'Who viewed you', onBack: () => navigate(-1) }), [navigate]));
  const { user } = useAuth();
  const userId = user?.id;
  const load = useMemo(() => (userId ? () => getViews(userId) : null), [userId]);
  const { items: viewers, state, reload } = useList(load);

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="page-scroll">
        {state === 'loading' && (
          <CupLoading/>
        )}

        {state === 'error' && <LoadError onRetry={reload}>Couldn't load who viewed you.</LoadError>}

        {state === 'ready' && viewers.length === 0 && (
          <CupMessage mood="shy" title="No one has viewed your profile yet."/>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state === 'ready' && viewers.map(v => (
            <Link
              key={v.id}
              to={`/profile/${v.id}`}
              className="list-card"
              style={{
                color: 'inherit',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--white)', border: '1.5px solid var(--cream3)',
                borderRadius: 'var(--r-md)', padding: '10px 14px', cursor: 'pointer',
              }}
            >
              <Avatar name={displayName(v, null)} src={v.profile_photo_url} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{displayName(v, null)}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)' }}>@{v.username}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic' }}>{timeAgo(v.viewed_at)}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
