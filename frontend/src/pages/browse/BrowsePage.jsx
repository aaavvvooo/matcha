import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle, Bell, User } from 'lucide-react';
import { browse, getAllTags } from '../../api/profilesApi';
import { likeUser } from '../../api/usersApi';
import { apiError } from '../../api/errors';
import { useNotifications } from '../../context/NotificationContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';
import { displayName } from '../../utils/displayName';
import FormInput from '../../components/ui/FormInput';
import { filterErrors, MAX_AGE, MAX_DISTANCE_KM, MAX_FAME, MAX_TAG_FILTERS, MIN_AGE } from '../../utils/formValidation';
import './BrowsePage.css';

const PAGE_SIZE = 20;
const SORTS = [['score', 'best match'], ['distance', 'distance'], ['age', 'age'], ['fame', 'fame'], ['tags', 'common tags']];
const NO_FILTERS = { minAge: '', maxAge: '', maxDistance: '', minFame: '', maxFame: '', tags: [] };
// [key, label, width, input bounds]
const FILTER_FIELDS = [
  ['minAge', 'Min age', 90, { min: MIN_AGE, max: MAX_AGE, step: 1 }],
  ['maxAge', 'Max age', 90, { min: MIN_AGE, max: MAX_AGE, step: 1 }],
  ['maxDistance', 'Within km', 100, { min: 1, max: MAX_DISTANCE_KM, step: 'any' }],
  ['minFame', 'Min fame', 90, { min: 0, max: MAX_FAME, step: 'any' }],
  ['maxFame', 'Max fame', 90, { min: 0, max: MAX_FAME, step: 'any' }],
];
// Values that filter nothing on the server: not counted as active filters.
const NO_OP_VALUES = { minAge: MIN_AGE, minFame: 0, maxFame: MAX_FAME };
const sameFilters = (a, b) =>
  FILTER_FIELDS.every(([k]) => String(a[k]).trim() === String(b[k]).trim()) &&
  a.tags.length === b.tags.length && a.tags.every(t => b.tags.includes(t));
const isActive = (k, v) => String(v).trim() !== '' && Number(v) !== NO_OP_VALUES[k];
const countActive = f => FILTER_FIELDS.filter(([k]) => isActive(k, f[k])).length + (f.tags.length ? 1 : 0);

// Empty inputs are left out so the server applies no bound.
function toParams(sortBy, f, offset) {
  const num = v => (v === '' || v == null ? undefined : Number(v));
  return {
    sort_by: sortBy,
    min_age: num(f.minAge),
    max_age: num(f.maxAge),
    max_distance_km: num(f.maxDistance),
    min_fame: num(f.minFame),
    max_fame: num(f.maxFame),
    tags: f.tags.length ? f.tags.join(',') : undefined,
    limit: PAGE_SIZE,
    offset,
  };
}

function SortChips({ sortBy, onSort, className }) {
  return (
    <div className={`browse-sort ${className}`} role="group" aria-label="Sort by">
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Sort:</div>
      {SORTS.map(([key, label]) => (
        <Chip key={key} label={label} active={sortBy === key} aria-pressed={sortBy === key} onClick={() => onSort(key)}/>
      ))}
    </div>
  );
}

function ProfileCard({ profile, onLike, onOpenProfile, isPreview, drag, isDragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
  const rotation = drag.x * 0.035;
  const opacity = Math.max(0.4, 1 - Math.abs(drag.x) / 260);
  const name = displayName(profile, 'Unknown');
  const tags = profile.tags || [];
  const photos = profile.photos || [];
  const firstPhoto = photos[0]?.url;

  return (
    <div
      className="browse-card"
      data-testid="browse-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerCancel}
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
      <div className="browse-card-photo" style={{
        background: firstPhoto
          ? `url(${firstPhoto}) center/cover`
          : 'linear-gradient(160deg, var(--cream2) 0%, var(--cream3) 100%)',
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
            display: 'flex', alignItems: 'center', gap: 6,
          }}>Like <Sparkle size={16} fill="var(--matcha)"/></div>
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
              {profile.distance_km ? `${profile.distance_km.toFixed(0)} km · ` : ''}{profile.location_label || ''}
            </div>
          </div>
          <FameMeter score={profile.fame_rating || 0}/>
        </div>
        {profile.bio && (
          <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5, marginBottom: 8 }}>{profile.bio}</div>
        )}
        <div className="browse-card-tags">
          {tags.map(t => (
            <span key={t} style={{
              padding: '3px 9px', borderRadius: 'var(--r-full)',
              background: 'var(--cream2)', border: '1px solid var(--sand)',
              fontSize: 10, color: 'var(--ink3)',
            }}>#{t}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="browse-card-actions">
        <Btn variant="secondary" onClick={e => { e.stopPropagation(); onLike(false); }} style={{ flex: 1, padding: '10px', fontSize: 13 }}>Pass</Btn>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onOpenProfile(profile); }}
          aria-label={`Open ${name}'s full profile`}
          title="Full profile"
          style={{
          padding: '10px 14px', borderRadius: 'var(--r-full)',
          background: 'var(--cream2)', border: '1.5px solid var(--sand)',
          color: 'var(--ink3)', fontSize: 13, cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          display: 'flex', alignItems: 'center',
        }}><User size={16} aria-hidden="true"/></button>
        <Btn variant="matcha" onClick={e => { e.stopPropagation(); onLike(true); }} style={{ flex: 1, padding: '10px', fontSize: 13 }}>Like <Sparkle size={13} fill="currentColor"/></Btn>
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

  const name = displayName(profile, 'Unknown');
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
              {profile.age ? `${profile.age} · ` : ''}{profile.location_label || ''}{profile.distance_km ? ` · ${profile.distance_km.toFixed(0)} km` : ''}
            </div>
          </div>
          <FameMeter score={profile.fame_rating || 0} size="lg"/>
        </div>

        {profile.bio && (
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 14, border: '1.5px solid var(--cream3)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 6 }}>ABOUT</div>
            <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.65 }}>{profile.bio}</div>
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
            <div style={{ fontSize: 12, color: 'var(--matcha2)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkle size={12} fill="var(--matcha2)"/> {shared.length} shared interest{shared.length > 1 ? 's' : ''}: {shared.map(t => `#${t}`).join(', ')}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <Btn variant="secondary" onClick={() => onProfile(profile)} style={{ flex: 1 }}>Full profile</Btn>
          <Btn variant="matcha" onClick={() => onLike(true)} style={{ flex: 1 }}>Like <Sparkle size={14} fill="currentColor"/></Btn>
        </div>
      </div>
    </div>
  );
}

function MatchOverlay({ profile, onChat, onClose }) {
  const name = displayName(profile, 'them');
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
  const [queue, setQueue] = useState([]);
  const [sortBy, setSortBy] = useState('score');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [draft, setDraft] = useState(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [tagsError, setTagsError] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Liked people drop out of the server's list, passed ones stay: the next page
  // starts after the ones passed in this sort/filter session.
  const passedRef = useRef(0);
  // Only the latest request may update the stack (sort/filter can change mid-flight).
  const requestRef = useRef(0);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [matchProfile, setMatchProfile] = useState(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likeError, setLikeError] = useState(null);
  const dragRef = useRef(null);
  // One like at a time: the card stays until the server answers, so it can be tapped again.
  const likingRef = useRef(false);
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  // Out-of-range values would be a 422 that replaces the stack with an error: flag them while
  // typing and keep Apply disabled instead. "Applied" makes an unchanged draft visibly a no-op.
  const draftErrors = filterErrors(draft);
  const draftValid = Object.keys(draftErrors).length === 0;
  const draftChanged = !sameFilters(draft, filters);
  const activeFilters = countActive(filters);

  function applyFilters() {
    if (!draftValid || !draftChanged) return;
    setFilters(draft);
    setShowFilters(false); // the open panel pushed the card stack out of view
  }

  function toggleFilters() {
    // Closing without Apply drops the unapplied edits, so reopening shows what is in effect.
    if (showFilters) setDraft(filters);
    setShowFilters(v => !v);
  }

  // Phones only: the panel covers the card, so show the re-sorted stack unless edits are pending.
  function sortFromPanel(key) {
    setSortBy(key);
    if (!draftChanged) setShowFilters(false);
  }

  function toggleDraftTag(name) {
    setDraft(d => {
      if (d.tags.includes(name)) return { ...d, tags: d.tags.filter(x => x !== name) };
      if (d.tags.length >= MAX_TAG_FILTERS) return d; // server limit; the panel says so
      return { ...d, tags: [...d.tags, name] };
    });
  }

  const loadPage = useCallback(async (offset, replace) => {
    const request = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await browse(toParams(sortBy, filters, offset));
      if (request !== requestRef.current) return;
      setQueue(q => (replace ? data : [...q, ...data]));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      if (request !== requestRef.current) return;
      if (replace) setQueue([]);
      setLoadError(apiError(err, 'Could not load suggestions'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [sortBy, filters]);

  useEffect(() => {
    passedRef.current = 0;
    loadPage(0, true);
  }, [loadPage]);

  useEffect(() => {
    getAllTags().then(setAllTags).catch(() => setTagsError(true));
  }, []);

  // Fetch the next page when the stack runs out.
  useEffect(() => {
    if (!loading && !loadError && queue.length === 0 && hasMore) loadPage(passedRef.current, false);
  }, [queue.length, hasMore, loading, loadError, loadPage]);

  const sorted = queue;

  const currentProfile = sorted[0];

  const handleAction = useCallback(async (yes) => {
    if (!currentProfile || likingRef.current) return;
    if (yes) {
      likingRef.current = true;
      try {
        const result = await likeUser(currentProfile.user_id);
        if (result?.is_match) {
          setMatchProfile(currentProfile);
          setTimeout(() => setMatchProfile(null), 3000);
        }
      } catch (err) {
        setDrag({ x: 0, y: 0 });
        const msg = err?.response?.data?.detail;
        if (msg) {
          setLikeError(msg);
          setTimeout(() => setLikeError(null), 4000);
        }
        return;
      } finally {
        likingRef.current = false;
      }
    }
    if (!yes) passedRef.current += 1;
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
    // Touch fires leave after up/cancel: only the event that ends a live drag may act.
    if (!dragRef.current) return;
    if (Math.abs(drag.x) > 70) {
      handleAction(drag.x > 0);
    } else {
      setDrag({ x: 0, y: 0 });
    }
    setIsDragging(false);
    dragRef.current = null;
  }, [drag.x, handleAction]);

  // The browser took the touch over (scrolling): not a swipe, put the card back.
  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
    setDrag({ x: 0, y: 0 });
  }, []);

  return (
    <div className="screen browse">
      {/* Top bar. On phones the site header already shows the brand and the bell, and
          sorting lives in the filter panel. */}
      <div className="browse-bar">
        <div className="browse-brand desktop-only">
          <MatchaCup size={30} mood="happy" animate={false}/>Matcha
        </div>
        <div className="browse-controls">
          <SortChips className="desktop-only" sortBy={sortBy} onSort={setSortBy}/>
          <Chip
            label={showFilters ? 'hide filters' : activeFilters ? `filters · ${activeFilters}` : 'filters'}
            active={showFilters || activeFilters > 0}
            onClick={toggleFilters}
            aria-expanded={showFilters}
            aria-controls="browse-filters"
          />
        </div>
        <button className="browse-bell desktop-only" onClick={() => navigate('/matches')}>
          <Bell size={22} strokeWidth={1.75} color="var(--ink3)"/>
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

      {showFilters && (
        <div id="browse-filters" className="browse-filters">
          <SortChips className="mobile-only" sortBy={sortBy} onSort={sortFromPanel}/>
          {FILTER_FIELDS.map(([key, label, width, bounds]) => (
            <FormInput
              key={key}
              label={label}
              type="number"
              value={draft[key]}
              onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
              error={draftErrors[key]}
              inputMode="decimal"
              {...bounds}
              style={{ width }}
            />
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexBasis: '100%' }}>
            {tagsError && (
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Interest tags couldn't be loaded — reload the page to filter by tags.</div>
            )}
            {allTags.map(t => (
              <Chip
                key={t.id}
                label={`#${t.name}`}
                active={draft.tags.includes(t.name)}
                aria-pressed={draft.tags.includes(t.name)}
                onClick={() => toggleDraftTag(t.name)}
              />
            ))}
            <div aria-live="polite" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--danger-fg)' }}>
              {draftErrors.tags || (draft.tags.length >= MAX_TAG_FILTERS ? `Up to ${MAX_TAG_FILTERS} interests` : '')}
            </div>
          </div>
          <div className="browse-filter-actions">
            <Btn onClick={applyFilters} disabled={!draftValid || !draftChanged}>
              {draftChanged || !draftValid ? 'Apply' : 'Applied'}
            </Btn>
            <Btn variant="ghost" onClick={() => { setDraft(NO_FILTERS); setFilters(NO_FILTERS); }}>Reset</Btn>
          </div>
        </div>
      )}

      {/* Match overlay */}
      {matchProfile && (
        <MatchOverlay
          profile={matchProfile}
          onChat={p => navigate(`/chat/${p.user_id}`)}
          onClose={() => setMatchProfile(null)}
        />
      )}

      {/* Two-column body */}
      <div className="browse-body">
        {/* Left: card stack */}
        <div className="browse-stack">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <MatchaCup size={60} mood="happy" animate={true} style={{ margin: '0 auto 12px', animation: 'float 3s ease-in-out infinite' }}/>
              <div style={{ fontSize: 14, color: 'var(--ink4)', fontStyle: 'italic' }}>Finding people nearby…</div>
            </div>
          ) : currentProfile ? (
            <>
              {/* Ghost card behind */}
              {sorted[1] && (
                <div className="desktop-only" style={{
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
                onPointerCancel={onPointerCancel}
                onLike={handleAction}
                onOpenProfile={p => navigate(`/profile/${p.user_id}`)}
              />

              <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>
                {sorted.length}{hasMore ? '+' : ''}
                {' in your stack'}{activeFilters ? ' · filtered' : ''} · drag the card or use the buttons
              </div>

              {/* Coming up strip */}
              {sorted.length > 1 && (
                <div className="desktop-only" style={{ width: '100%', maxWidth: 360, marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 8 }}>Coming up</div>
                  <div style={{ display: 'flex', gap: 8, overflow: 'hidden' }}>
                    {sorted.slice(1, 4).map(p => {
                      const n = displayName(p, '?');
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
                            {p.distance_km && <div style={{ fontSize: 10, color: 'var(--ink4)', whiteSpace: 'nowrap' }}>{p.distance_km.toFixed(0)} km</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : loadError ? (
            <div role="alert" style={{ textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--ink2)' }}>{loadError}</div>
              <Btn variant="secondary" onClick={() => loadPage(passedRef.current, true)}>Try again</Btn>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <MatchaCup size={80} mood="sleepy" animate={true} style={{ margin: '0 auto 12px' }}/>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, color: 'var(--ink2)', marginBottom: 8 }}>That's everyone for now.</div>
              <div style={{ fontSize: 14, color: 'var(--ink4)' }}>Check back later — new people join every day.</div>
            </div>
          )}
        </div>

        {/* Right: profile detail panel */}
        <div className="browse-detail">
          <RightPanel
            profile={previewProfile || currentProfile}
            onProfile={p => navigate(`/profile/${p.user_id}`)}
            onLike={handleAction}
          />
        </div>
      </div>

      {likeError && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--rose)', color: '#fff', padding: '12px 20px',
          borderRadius: 'var(--r-sm)', fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 2000,
          maxWidth: '90vw', textAlign: 'center', pointerEvents: 'none',
        }}>
          {likeError}
        </div>
      )}
    </div>
  );
}
