import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getUser, likeUser, unlikeUser, blockUser, reportUser } from '../../api/usersApi';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';

export default function ProfileViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [liked, setLiked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUser(id)
      .then(data => {
        setProfile(data);
        setLiked(data.is_liked_by_me || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleLike() {
    try {
      if (liked) {
        await unlikeUser(id);
        setLiked(false);
      } else {
        await likeUser(id);
        setLiked(true);
      }
    } catch {}
  }

  async function handleBlock() {
    if (window.confirm('Block this user?')) {
      await blockUser(id).catch(() => {});
      setBlocked(true);
    }
  }

  async function handleReport() {
    await reportUser(id).catch(() => {});
  }

  if (blocked) {
    return (
      <div style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, color: 'var(--ink2)', textAlign: 'center' }}>
          You've blocked {profile?.full_name || profile?.username || 'this user'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink4)', textAlign: 'center' }}>They won't appear in search or send you notifications.</div>
        <Btn variant="secondary" onClick={() => navigate(-1)}>← Go back</Btn>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
        <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic' }}>Loading…</div>
      </div>
    );
  }

  const name = profile.full_name || profile.username || 'Unknown';
  const tags = profile.tags || [];
  const firstPhoto = profile.photos?.[0]?.url;

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav bar */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={handleReport} style={{ fontSize: 12, padding: '6px 12px' }}>Report</Btn>
          <Btn variant="danger" onClick={handleBlock} style={{ fontSize: 12, padding: '6px 12px' }}>Block</Btn>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Hero */}
        <div style={{
          height: 200,
          background: firstPhoto ? `url(${firstPhoto}) center/cover` : 'linear-gradient(160deg, var(--cream2), var(--cream3))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {!firstPhoto && <Avatar name={name} size={88} online={profile.is_online}/>}
          <div style={{
            position: 'absolute', bottom: 12, right: 14,
            fontSize: 11, color: profile.is_online ? 'var(--matcha2)' : 'var(--ink4)',
            background: 'rgba(255,255,255,.85)', padding: '3px 9px', borderRadius: 20,
          }}>
            {profile.is_online ? '● online now' : 'offline'}
          </div>
        </div>

        <div style={{ padding: '20px 20px 32px' }}>
          {/* Name + info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{name}</div>
              <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 4 }}>
                {profile.age ? `${profile.age} · ` : ''}{profile.location_label || ''}{profile.distance_km ? ` · ${profile.distance_km.toFixed(1)}km away` : ''}
              </div>
            </div>
            <FameMeter score={profile.fame_rating || 0} size="lg"/>
          </div>

          {/* Already liked banner */}
          {profile.liked_me && (
            <div style={{
              padding: '11px 14px', borderRadius: 'var(--r-md)',
              background: '#fff5ee', border: '1.5px solid var(--clay)',
              fontSize: 13, color: 'var(--spice2)',
              marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>✦</span> <span><b>{name}</b> already liked your profile</span>
            </div>
          )}

          {/* Bio */}
          {profile.biography && (
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 8 }}>ABOUT</div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65 }}>{profile.biography}</div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 10 }}>INTERESTS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {tags.map(t => (
                  <span key={t} style={{ padding: '6px 13px', borderRadius: 'var(--r-full)', background: 'var(--cream2)', border: '1.5px solid var(--sand)', fontSize: 12, color: 'var(--ink2)' }}>#{t}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', marginBottom: 20 }}>
            Viewing this profile has been recorded in their visit history.
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn
              variant={liked ? 'primary' : 'secondary'}
              onClick={toggleLike}
              style={{ flex: 1 }}
            >
              {liked ? '✦ Liked!' : '✦ Like'}
            </Btn>
            {liked && profile.liked_me && (
              <Btn variant="matcha" onClick={() => navigate(`/chat/${id}`)} style={{ flex: 1 }}>
                Message →
              </Btn>
            )}
          </div>
          {liked && !profile.liked_me && (
            <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', textAlign: 'center', marginTop: 10 }}>
              When {name} likes you back, you'll be able to chat.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
