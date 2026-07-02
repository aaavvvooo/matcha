import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Ban, Sparkle } from 'lucide-react';
import { getUser, likeUser, unlikeUser, blockUser, reportUser } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import './ProfileViewPage.css';

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ProfileViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMe = user && String(user.id) === String(id);
  const [profile, setProfile] = useState(null);
  const [liked, setLiked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setPhotoIdx(0);
    getUser(id)
      .then(data => {
        setProfile(data);
        setLiked(data.is_liked_by_me || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const photos = profile?.photos || [];
  const sortedPhotos = [...photos].sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0));
  const goToPhoto = (i) => setPhotoIdx((i + sortedPhotos.length) % sortedPhotos.length);

  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') goToPhoto(photoIdx + 1);
      else if (e.key === 'ArrowLeft') goToPhoto(photoIdx - 1);
      else if (e.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen, photoIdx, sortedPhotos.length]);

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
        <Ban size={48} strokeWidth={1.5} color="var(--rose)"/>
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
  const currentPhoto = sortedPhotos[photoIdx];
  const infoLine = [profile.age ? `${profile.age}` : null, profile.location_label || null, profile.distance_km ? `${profile.distance_km.toFixed(1)}km away` : null].filter(Boolean).join(' · ');
  const traitsLine = [profile.gender, profile.sexual_orientation].filter(Boolean).join(' · ');

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Nav bar */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--ink3)', lineHeight: 1 }}>←</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {isMe ? (
            <Btn variant="secondary" onClick={() => navigate('/profile/edit')} style={{ fontSize: 12, padding: '6px 12px' }}>Edit profile</Btn>
          ) : (
            <>
              <Btn variant="ghost" onClick={handleReport} style={{ fontSize: 12, padding: '6px 12px' }}>Report</Btn>
              <Btn variant="danger" onClick={handleBlock} style={{ fontSize: 12, padding: '6px 12px' }}>Block</Btn>
            </>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div className="profile-view-body">
          {/* Hero photo carousel */}
          <div className="profile-view-hero">
            {currentPhoto ? (
              <img
                src={currentPhoto.url}
                alt=""
                onClick={() => setPreviewOpen(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Avatar name={name} size={88} online={profile.is_online}/>
              </div>
            )}

            {sortedPhotos.length > 1 && (
              <>
                <button
                  onClick={() => goToPhoto(photoIdx - 1)}
                  style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff',
                    width: 32, height: 32, borderRadius: '50%', fontSize: 16,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >‹</button>
                <button
                  onClick={() => goToPhoto(photoIdx + 1)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff',
                    width: 32, height: 32, borderRadius: '50%', fontSize: 16,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >›</button>
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
                  {sortedPhotos.map((p, i) => (
                    <div key={p.id} onClick={() => goToPhoto(i)} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.45)',
                      cursor: 'pointer',
                    }}/>
                  ))}
                </div>
              </>
            )}

            <div style={{
              position: 'absolute', top: 12, right: 14,
              fontSize: 11, color: profile.is_online ? 'var(--matcha2)' : 'var(--ink4)',
              background: 'rgba(255,255,255,.85)', padding: '3px 9px', borderRadius: 20,
            }}>
              {profile.is_online ? '● online now' : profile.last_seen ? `last seen ${timeAgo(profile.last_seen)}` : 'offline'}
            </div>
          </div>

          <div className="profile-view-content">
            {/* Name + info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{name}</div>
                {profile.username && <div style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 4 }}>@{profile.username}</div>}
                {infoLine && <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 4 }}>{infoLine}</div>}
                {traitsLine && <div style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 2 }}>{traitsLine}</div>}
              </div>
              <FameMeter score={profile.fame_rating || 0} size="lg"/>
            </div>

            {/* Already liked banner */}
            {!isMe && profile.liked_me && (
              <div style={{
                padding: '11px 14px', borderRadius: 'var(--r-md)',
                background: '#fff5ee', border: '1.5px solid var(--clay)',
                fontSize: 13, color: 'var(--spice2)',
                marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Sparkle size={14}/> <span><b>{name}</b> already liked your profile</span>
              </div>
            )}

            {/* Bio */}
            {profile.bio && (
              <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14, border: '1.5px solid var(--cream3)' }}>
                <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 8 }}>ABOUT</div>
                <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65 }}>{profile.bio}</div>
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

            {isMe ? (
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                {[[profile.views_count || 0, 'viewed you', '/profile/viewers'], [profile.likes_count || 0, 'liked you', '/profile/liked-by']].map(([n, l, path]) => (
                  <div
                    key={l}
                    onClick={() => navigate(path)}
                    style={{ flex: 1, textAlign: 'center', padding: '12px', background: 'var(--white)', border: '1.5px solid var(--cream3)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
                  >
                    <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: 'var(--spice)' }}>{n}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            ) : (
              <>
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
                    <Sparkle size={15} fill={liked ? 'currentColor' : 'none'}/> {liked ? 'Liked!' : 'Like'}
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
              </>
            )}
          </div>
        </div>
      </div>

      {previewOpen && currentPhoto && (
        <div
          onClick={() => setPreviewOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 16,
          }}
        >
          {sortedPhotos.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); goToPhoto(photoIdx - 1); }}
              style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 44, height: 44, borderRadius: '50%', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >‹</button>
          )}
          <img
            src={currentPhoto.url}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 'var(--r-md)', objectFit: 'contain' }}
          />
          {sortedPhotos.length > 1 && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
              {sortedPhotos.map((p, i) => (
                <div key={p.id} onClick={() => goToPhoto(i)} style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: i === photoIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', transition: 'background 0.2s',
                }}/>
              ))}
            </div>
          )}
          {sortedPhotos.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); goToPhoto(photoIdx + 1); }}
              style={{
                position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
                width: 44, height: 44, borderRadius: '50%', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >›</button>
          )}
          <button
            onClick={() => setPreviewOpen(false)}
            style={{
              padding: '10px 20px', borderRadius: 'var(--r-sm)',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              fontSize: 14, cursor: 'pointer',
            }}
          >Close</button>
        </div>
      )}
    </div>
  );
}
