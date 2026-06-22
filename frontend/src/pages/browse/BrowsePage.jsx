import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { browse } from '../../api/profilesApi';
import { likeUser, unlikeUser } from '../../api/usersApi';
import { useNotifications } from '../../context/NotificationContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';

function ProfileCard({ profile, onLike, onPreview, isPreview, drag, isDragging, onPointerDown, onPointerMove, onPointerUp }) {
  const rotation = drag.x * 0.035;
  const opacity = Math.max(0.4, 1 - Math.abs(drag.x) / 260);
  const name = profile.full_name || profile.username || 'Unknown';
  const tags = profile.tags || [];
  const photos = profile.photos || [];
  const firstPhoto = photos[0]?.url;

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth: 360,
        background: 'var(--white)',
        borderRadius: 24,
        border: isPreview ? '2px solid var(--spice)' : '1.5px solid var(--cream3)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        transform: `translateX(${drag.x}px) translateY(${drag.y}px) rotate(${rotation}deg)`,
        opacity,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        transition: isDragging ? 'none' : 'transform .35s cubic-bezier(.34,1.56,.64,1), opacity .2s',
      }}
    >
      {/* Photo area */}
      <div style={{
        height: 200,
        background: firstPhoto
          ? `url(${firstPhoto}) center/cover`
          : 'linear-gradient(160deg, var(--cream2) 0%, var(--cream3) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {!firstPhoto && (
          <div style={{ textAlign: 'center' }}>
            <Avatar name={name} size={72} online={profile.is_online}/>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink4)', fontStyle: 'italic' }}>no photo yet</div>
          </div>
        )}

        {/* Drag stamps */}
        {drag.x > 40 && (
          <div style={{
            position: 'absolute', top: 16, left: 16,
            padding: '5px 12px', borderRadius: 8,
            border: '2.5px solid var(--matcha)', color: 'var(--matcha)',
            fontSize: 18, fontWeight: 700, fontFamily: 'Playfair Display, serif', fontStyle: 'italic',
            transform: 'rotate(-8deg)', background: 'rgba(255,255,255,.85)',
          }}>Like ✦</div>
        )}
        {drag.x < -40 && (
          <div style={{
            position: 'absolute', top: 16, right: 16,
            padding: '5px 12px', borderRadius: 8,
            border: '2.5px solid var(--clay)', color: 'var(--clay)',
            fontSize: 18, fontWeight: 700, fontFamily: 'Playfair Display, serif', fontStyle: 'italic',
            transform: 'rotate(8deg)', background: 'rgba(255,255,255,.85)',
          }}>Pass</div>
        )}

        {/* Online badge */}
        <div style={{
          position: 'absolute', bottom: 8, right: 10,
          fontSize: 11, color: profile.is_online ? 'var(--matcha2)' : 'var(--ink4)',
          background: 'rgba(255,255,255,.85)', padding: '2px 8px', borderRadius: 20,
        }}>
          {profile.is_online ? '● online' : 'offline'}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: 'var(--ink)' }}>
              {name}{profile.age ? `, ${profile.age}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 1 }}>
              {profile.distance_km ? `${profile.distance_km.toFixed(1)}km · ` : ''}{profile.location_label || ''}
            </div>
          </div>
          <FameMeter score={profile.fame_rating || 0}/>
        </div>
        {profile.biography && (
          <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 8 }}>{profile.biography}</div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {tags.slice(0, 4).map(t => (
            <span key={t} style={{
              padding: '3px 9px', borderRadius: 'var(--r-full)',
              background: 'var(--cream2)', border: '1px solid var(--sand)',
              fontSize: 10, color: 'var(--ink3)',
            }}>#{t}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '6px 14px 14px', display: 'flex', gap: 8 }}>
        <Btn variant="secondary" onClick={e => { e.stopPropagation(); onLike(false); }} style={{ flex: 1, padding: '10px', fontSize: 13 }}>Pass</Btn>
        <button onClick={e => { e.stopPropagation(); onPreview(profile); }} style={{
          padding: '10px 14px', borderRadius: 'var(--r-full)',
          background: 'var(--cream2)', border: '1.5px solid var(--sand)',
          color: 'var(--ink3)', fontSize: 13, cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
        }}>···</button>
        <Btn variant="matcha" onClick={e => { e.stopPropagation(); onLike(true); }} style={{ flex: 1, padding: '10px', fontSize: 13 }}>Like ✦</Btn>
      </div>
    </div>
  );
}

function RightPanel({ profile, onProfile, onLike, myTags = [] }) {
  if (!profile) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', opacity: .5 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>←</div>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 18, color: 'var(--ink3)' }}>Select a profile to preview</div>
        </div>
      </div>
    );
  }

  const name = profile.full_name || profile.username || 'Unknown';
  const tags = profile.tags || [];
  const shared = tags.filter(t => myTags.includes(t));
  const firstPhoto = profile.photos?.[0]?.url;

  return (
    <div className="anim-scale" key={profile.user_id} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{
        height: 220,
        background: firstPhoto
          ? `url(${firstPhoto}) center/cover`
          : 'linear-gradient(160deg, var(--cream2), var(--cream3))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
        borderBottom: '1.5px solid var(--cream3)',
      }}>
        {!firstPhoto && <Avatar name={name} size={100} online={profile.is_online}/>}
        <div style={{
          position: 'absolute', bottom: 12, right: 16,
          fontSize: 11, color: profile.is_online ? 'var(--matcha2)' : 'var(--ink4)',
          background: 'rgba(255,255,255,.85)', padding: '3px 10px', borderRadius: 20,
        }}>
          {profile.is_online ? '● online now' : 'offline'}
        </div>
      </div>

      <div style={{ padding: '20px 24px 32px', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>{name}</div>
            <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 4 }}>
              {profile.age ? `${profile.age} · ` : ''}{profile.location_label || ''}{profile.distance_km ? ` · ${profile.distance_km.toFixed(1)}km` : ''}
            </div>
          </div>
          <FameMeter score={profile.fame_rating || 0} size="lg"/>
        </div>

        {profile.biography && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14, border: '1.5px solid var(--cream3)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 6 }}>ABOUT</div>
            <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65 }}>{profile.biography}</div>
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 10 }}>INTERESTS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tags.map(t => (
                <span key={t} style={{ padding: '6px 13px', borderRadius: 'var(--r-full)', background: 'var(--white)', border: '1.5px solid var(--sand)', fontSize: 12, color: 'var(--ink2)' }}>#{t}</span>
              ))}
            </div>
          </div>
        )}

        {shared.length > 0 && (
          <div style={{ padding: '11px 14px', borderRadius: 'var(--r-md)', background: '#f0f7ee', border: '1.5px solid #c8dfc4', marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--matcha2)', fontWeight: 500 }}>
              ✦ {shared.length} shared interest{shared.length > 1 ? 's' : ''}: {shared.map(t => `#${t}`).join(', ')}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <Btn variant="secondary" onClick={() => onProfile(profile)} style={{ flex: 1 }}>Full profile</Btn>
          <Btn variant="matcha" onClick={() => onLike(true)} style={{ flex: 1 }}>Like ✦</Btn>
        </div>
      </div>
    </div>
  );
}

function MatchOverlay({ profile, onChat, onClose }) {
  const name = profile?.full_name || profile?.username || 'them';
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(107,143,94,.95)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn .2s ease',
    }}>
      <MatchaCup size={100} mood="excited" animate={true} style={{ animation: 'wiggle .6s ease-in-out infinite', marginBottom: 8 }}/>
      <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 36, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.2 }}>
        It's a match!
      </div>
      <div style={{ fontSize: 16, color: 'rgba(255,255,255,.8)', marginTop: 12 }}>
        You and {name} liked each other
      </div>
      <button onClick={() => onChat(profile)} style={{
        marginTop: 28, padding: '13px 32px', borderRadius: 'var(--r-full)',
        background: '#fff', border: 'none', color: 'var(--matcha)',
        fontSize: 15, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}>Send a message →</button>
      <button onClick={onClose} style={{
        marginTop: 12, background: 'none', border: 'none',
        color: 'rgba(255,255,255,.7)', fontSize: 14, cursor: 'pointer',
        fontFamily: 'DM Sans, sans-serif',
      }}>Keep browsing</button>
    </div>
  );
}

export default function BrowsePage() {
  const [profiles, setProfiles] = useState([]);
  const [queue, setQueue] = useState([]);
  const [sortBy, setSortBy] = useState('proximity');
  const [previewProfile, setPreviewProfile] = useState(null);
  const [matchProfile, setMatchProfile] = useState(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const dragRef = useRef(null);
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    browse({ limit: 20, offset: 0 })
      .then(data => {
        setProfiles(data);
        setQueue(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    if (!queue.length) return queue;
    const q = [...queue];
    if (sortBy === 'fame') q.sort((a, b) => (b.fame_rating || 0) - (a.fame_rating || 0));
    if (sortBy === 'tags') q.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
    return q;
  }, [queue, sortBy]);

  const currentProfile = sorted[0];

  const handleAction = useCallback(async (yes) => {
    if (!currentProfile) return;
    if (yes) {
      try {
        const result = await likeUser(currentProfile.user_id);
        if (result?.is_match) {
          setMatchProfile(currentProfile);
          setTimeout(() => setMatchProfile(null), 3000);
        }
      } catch {}
    }
    setQueue(q => q.filter(p => p.user_id !== currentProfile.user_id));
    setDrag({ x: 0, y: 0 });
    setPreviewProfile(null);
  }, [currentProfile]);

  const onPointerDown = useCallback(e => {
    dragRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback(e => {
    if (!isDragging || !dragRef.current) return;
    setDrag({ x: e.clientX - dragRef.current.x, y: (e.clientY - dragRef.current.y) * 0.15 });
  }, [isDragging]);

  const onPointerUp = useCallback(() => {
    if (Math.abs(drag.x) > 70) {
      handleAction(drag.x > 0);
    } else {
      setDrag({ x: 0, y: 0 });
    }
    setIsDragging(false);
    dragRef.current = null;
  }, [drag.x, handleAction]);

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)',
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MatchaCup size={30} mood="happy" animate={false}/>Matcha
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Sort:</div>
          {['proximity', 'fame', 'tags'].map(s => (
            <Chip key={s} label={s} active={sortBy === s} onClick={() => setSortBy(s)}/>
          ))}
        </div>
        <button onClick={() => navigate('/matches')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>🔔</span>
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: 'var(--rose)', color: '#fff',
              fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid var(--white)',
            }}>{unreadCount}</div>
          )}
        </button>
      </div>

      {/* Match overlay */}
      {matchProfile && (
        <MatchOverlay
          profile={matchProfile}
          onChat={p => navigate(`/chat/${p.user_id}`)}
          onClose={() => setMatchProfile(null)}
        />
      )}

      {/* Two-column body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Left: card stack */}
        <div style={{
          flex: '0 0 auto',
          width: 'min(100%, 420px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 20px 12px',
          borderRight: '1.5px solid var(--cream3)',
          background: 'var(--cream)',
          position: 'relative',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <MatchaCup size={60} mood="happy" animate={true} style={{ margin: '0 auto 12px', animation: 'float 3s ease-in-out infinite' }}/>
              <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic' }}>Finding people nearby…</div>
            </div>
          ) : currentProfile ? (
            <>
              {/* Ghost card behind */}
              {sorted[1] && (
                <div style={{
                  position: 'absolute',
                  width: 340,
                  background: 'var(--white)',
                  borderRadius: 24,
                  height: 340,
                  opacity: .45,
                  transform: 'scale(.95) translateY(14px)',
                  border: '1.5px solid var(--sand)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}/>
              )}

              <ProfileCard
                profile={currentProfile}
                isPreview={previewProfile?.user_id === currentProfile.user_id}
                drag={drag}
                isDragging={isDragging}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onLike={handleAction}
                onPreview={p => setPreviewProfile(p)}
              />

              <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>
                {sorted.length} {sorted.length === 1 ? 'person' : 'people'} nearby · drag or tap ···
              </div>

              {/* Coming up strip */}
              {sorted.length > 1 && (
                <div style={{ width: '100%', maxWidth: 360, marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 8 }}>Coming up</div>
                  <div style={{ display: 'flex', gap: 8, overflow: 'hidden' }}>
                    {sorted.slice(1, 4).map(p => {
                      const n = p.full_name || p.username || '?';
                      return (
                        <div key={p.user_id} onClick={() => setPreviewProfile(p)} style={{
                          flex: '0 0 auto', padding: '8px 10px',
                          background: 'var(--white)', borderRadius: 12,
                          border: previewProfile?.user_id === p.user_id ? '1.5px solid var(--spice)' : '1.5px solid var(--cream3)',
                          display: 'flex', gap: 8, alignItems: 'center',
                          cursor: 'pointer', transition: 'border .15s',
                        }}>
                          <Avatar name={n} size={28} online={p.is_online}/>
                          <div>
                            <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{n}</div>
                            {p.distance_km && <div style={{ fontSize: 10, color: 'var(--ink4)', whiteSpace: 'nowrap' }}>{p.distance_km.toFixed(1)}km</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <MatchaCup size={80} mood="sleepy" animate={true} style={{ margin: '0 auto 12px' }}/>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, color: 'var(--ink2)', marginBottom: 8 }}>That's everyone for now.</div>
              <div style={{ fontSize: 14, color: 'var(--ink4)' }}>Check back later — new people join every day.</div>
            </div>
          )}
        </div>

        {/* Right: profile detail panel */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--cream2)', display: 'flex', flexDirection: 'column' }}>
          <RightPanel
            profile={previewProfile || currentProfile}
            onProfile={p => navigate(`/profile/${p.user_id}`)}
            onLike={handleAction}
          />
        </div>
      </div>
    </div>
  );
}
