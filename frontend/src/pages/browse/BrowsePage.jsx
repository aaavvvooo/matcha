import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkle, User, SlidersHorizontal, X } from 'lucide-react';
import { browse, getAllTags } from '../../api/profilesApi';
import { likeUser } from '../../api/usersApi';
import { apiError } from '../../api/errors';
import { useAuth } from '../../context/AuthContext';
import { usePageHeader } from '../../context/HeaderContext';
import MatchaCup from '../../components/ui/MatchaCup';
import Avatar from '../../components/ui/Avatar';
import CupLoading from '../../components/ui/CupLoading';
import CupMessage from '../../components/ui/CupMessage';
import LoadError from '../../components/ui/LoadError';
import FameMeter from '../../components/ui/FameMeter';
import Btn from '../../components/ui/Btn';
import Chip from '../../components/ui/Chip';
import { displayName } from '../../utils/displayName';
import AgeRange from '../../components/filters/AgeRange';
import DistanceRadar from '../../components/filters/DistanceRadar';
import FameRange from '../../components/filters/FameRange';
import SortPicker from '../../components/filters/SortPicker';
import { SORTS } from '../../components/filters/sorts';
import { filterErrors, MAX_FAME, MAX_TAG_FILTERS, MIN_AGE } from '../../utils/formValidation';
import { loadBrowseSession, saveBrowseSession } from './browseSession';
import './BrowsePage.css';

const PAGE_SIZE = 20;
const COMING_UP = 5;
const POP_MS = 900; // cupMessages.css cupPop
// Coming back, the first page is wider and starts before the first unseen profile: ranks move a
// little (a visit raises fame), and the profile you left on must still be in it.
const RESUME_SIZE = 50; // server maximum
const RESUME_OVERLAP = 25;
const NO_FILTERS = { minAge: '', maxAge: '', maxDistance: '', minFame: '', maxFame: '', tags: [] };
const RANGE_KEYS = ['minAge', 'maxAge', 'maxDistance', 'minFame', 'maxFame'];
// Values that filter nothing on the server: not counted as active filters.
const NO_OP_VALUES = { minAge: MIN_AGE, minFame: 0, maxFame: MAX_FAME };
const sameFilters = (a, b) =>
  RANGE_KEYS.every(k => String(a[k]).trim() === String(b[k]).trim()) &&
  a.tags.length === b.tags.length && a.tags.every(t => b.tags.includes(t));
const isActive = (k, v) => String(v).trim() !== '' && Number(v) !== NO_OP_VALUES[k];
const countActive = f => RANGE_KEYS.filter(k => isActive(k, f[k])).length + (f.tags.length ? 1 : 0);

// Empty inputs are left out so the server applies no bound.
function toParams(sortBy, f, offset, limit) {
  const num = v => (v === '' || v == null ? undefined : Number(v));
  return {
    sort_by: sortBy,
    min_age: num(f.minAge),
    max_age: num(f.maxAge),
    max_distance_km: num(f.maxDistance),
    min_fame: num(f.minFame),
    max_fame: num(f.maxFame),
    tags: f.tags.length ? f.tags.join(',') : undefined,
    limit,
    offset,
  };
}

function SortChips({ sortBy, onSort, className = '' }) {
  return (
    <div className={`browse-sort ${className}`} role="group" aria-label="Sort by">
      <div style={{ fontSize: 12, color: 'var(--ink4)' }}>Sort:</div>
      {SORTS.map(([key, label]) => (
        <Chip key={key} label={label} active={sortBy === key} aria-pressed={sortBy === key} onClick={() => onSort(key)}/>
      ))}
    </div>
  );
}

function ProfileCard({ profile, onLike, onOpenProfile, drag, isDragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
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
        background: 'var(--white)',
        borderRadius: 24,
        border: '1.5px solid var(--cream3)',
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
      <div className="browse-card-info">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div className="browse-card-name">
              {name}{profile.age ? `, ${profile.age}` : ''}
            </div>
            <div className="browse-card-meta">
              {profile.distance_km ? `${profile.distance_km.toFixed(0)} km · ` : ''}{profile.location_label || ''}
            </div>
          </div>
          <FameMeter score={profile.fame_rating || 0}/>
        </div>
        {profile.bio && (
          <div className="browse-card-bio">{profile.bio}</div>
        )}
        <div className="browse-card-tags">
          {tags.map(t => (
            <span key={t} className="browse-card-tag">#{t}</span>
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

function MatchOverlay({ profile, onChat, onClose }) {
  const name = displayName(profile, 'them');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(107,143,94,.95)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn .2s ease',
    }}>
      <MatchaCup size={100} mood="match" animate={true} style={{ animation: 'wiggle .6s ease-in-out infinite', marginBottom: 8 }}/>
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
  const { user } = useAuth();
  const userId = user?.id;
  const [resumed] = useState(() => loadBrowseSession(userId));
  const [queue, setQueue] = useState([]);
  const [sortBy, setSortBy] = useState(resumed?.sortBy ?? 'score');
  const [filters, setFilters] = useState(resumed?.filters ?? NO_FILTERS);
  const [draft, setDraft] = useState(filters);
  const [showFilters, setShowFilters] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [tagsError, setTagsError] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Liked people drop out of the server's list, passed ones stay: the next page starts after
  // the ones passed in this sort/filter session. currentId is where a resumed session left off.
  const progressRef = useRef({
    sortBy, filters, passedIds: resumed?.passedIds ?? [], currentId: resumed?.currentId ?? null,
  });
  // Only the latest request may update the stack (sort/filter can change mid-flight).
  const requestRef = useRef(0);
  // `loading` as of now: effects run in the same flush as loadPage still see the old state.
  const loadingRef = useRef(false);
  const [matchProfile, setMatchProfile] = useState(null);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likeError, setLikeError] = useState(null);
  const [popId, setPopId] = useState(null); // the person just liked, while the cup pops
  const dragRef = useRef(null);
  // One like at a time: the card stays until the server answers, so it can be tapped again.
  const likingRef = useRef(false);
  const navigate = useNavigate();

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

  const toggleFilters = useCallback(() => {
    // Closing without Apply drops the unapplied edits, so reopening shows what is in effect.
    if (showFilters) setDraft(filters);
    setShowFilters(v => !v);
  }, [showFilters, filters]);

  usePageHeader(useMemo(() => ({
    title: 'Discover',
    phoneTitle: false,
    tools: (
      <>
        <SortChips className="wide-only" sortBy={sortBy} onSort={setSortBy}/>
        <Chip
          label={showFilters ? 'hide filters' : activeFilters ? `filters · ${activeFilters}` : 'filters'}
          active={showFilters || activeFilters > 0}
          onClick={toggleFilters}
          aria-expanded={showFilters}
          aria-controls={showFilters ? 'browse-filters' : undefined}
        />
      </>
    ),
  }), [sortBy, showFilters, activeFilters, toggleFilters]));

  // The panel covers the card on phones, so show the re-sorted stack unless edits are pending.
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

  const loadPage = useCallback(async (replace) => {
    const request = ++requestRef.current;
    const { passedIds, currentId } = progressRef.current;
    const resuming = replace && (passedIds.length > 0 || currentId !== null);
    const limit = resuming ? RESUME_SIZE : PAGE_SIZE;
    const offset = resuming ? Math.max(0, passedIds.length - RESUME_OVERLAP) : passedIds.length;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await browse(toParams(sortBy, filters, offset, limit));
      if (request !== requestRef.current) return;
      const unseen = data.filter(p => !passedIds.includes(p.user_id));
      const first = unseen.filter(p => p.user_id === currentId);
      const ordered = [...first, ...unseen.filter(p => p.user_id !== currentId)];
      setQueue(q => (replace ? ordered : [...q, ...ordered]));
      // A full page with nobody new would otherwise be requested over and over.
      setHasMore(data.length === limit && unseen.length > 0);
    } catch (err) {
      if (request !== requestRef.current) return;
      if (replace) setQueue([]);
      setLoadError(apiError(err, 'Could not load suggestions'));
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [sortBy, filters]);

  useEffect(() => {
    const progress = progressRef.current;
    if (progress.sortBy !== sortBy || progress.filters !== filters) {
      progressRef.current = { sortBy, filters, passedIds: [], currentId: null };
    }
    loadPage(true);
  }, [loadPage, sortBy, filters]);

  useEffect(() => {
    getAllTags().then(setAllTags).catch(() => setTagsError(true));
  }, []);

  // Fetch the next page when the stack runs out.
  useEffect(() => {
    if (!loading && !loadError && queue.length === 0 && hasMore) loadPage(false);
  }, [queue.length, hasMore, loading, loadError, loadPage]);

  const sorted = queue;

  const currentProfile = sorted[0];
  const currentId = currentProfile?.user_id ?? null;

  useEffect(() => {
    if (popId === null) return undefined;
    const timer = setTimeout(() => setPopId(null), POP_MS);
    return () => clearTimeout(timer);
  }, [popId]);

  useEffect(() => {
    if (loading || loadError) return; // an empty stack here is not where the user left off
    const isLoading = loadingRef.current;
    const everyoneSeen = currentId === null && !hasMore && !isLoading; // the next visit starts over
    saveBrowseSession(userId, {
      sortBy,
      filters,
      passedIds: everyoneSeen ? [] : progressRef.current.passedIds,
      currentId: isLoading ? null : currentId, // the card on screen belongs to the previous order
    });
  }, [userId, sortBy, filters, currentId, hasMore, loading, loadError]);

  const handleAction = useCallback(async (yes) => {
    if (!currentProfile || likingRef.current) return;
    if (yes) {
      likingRef.current = true;
      try {
        const result = await likeUser(currentProfile.user_id);
        if (result?.is_match) {
          setMatchProfile(currentProfile);
          setTimeout(() => setMatchProfile(null), 3000);
        } else {
          setPopId(currentProfile.user_id);
        }
      } catch (err) {
        setDrag({ x: 0, y: 0 });
        setLikeError(apiError(err, 'Could not send your like. Try again.'));
        setTimeout(() => setLikeError(null), 4000);
        return;
      } finally {
        likingRef.current = false;
      }
    }
    if (!yes) {
      const { passedIds, ...progress } = progressRef.current;
      progressRef.current = { ...progress, passedIds: [...passedIds, currentProfile.user_id] };
    }
    setQueue(q => q.filter(p => p.user_id !== currentProfile.user_id));
    setDrag({ x: 0, y: 0 });
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
      <button
        type="button"
        className={`browse-filter-fab mobile-only${showFilters || activeFilters ? ' browse-filter-fab--active' : ''}${showFilters ? ' browse-filter-fab--open' : ''}`}
        onClick={toggleFilters}
        aria-label={`${showFilters ? 'Hide filters' : 'Show filters'}${activeFilters ? `, ${activeFilters} active` : ''}`}
        aria-expanded={showFilters}
        aria-controls={showFilters ? 'browse-filters' : undefined}
      >
        {showFilters ? <X size={20} aria-hidden="true"/> : <SlidersHorizontal size={19} aria-hidden="true"/>}
        {activeFilters > 0 && !showFilters && <span className="browse-filter-fab-count">{activeFilters}</span>}
      </button>

      {showFilters && (
        <div id="browse-filters" className="browse-filters">
          <div className="browse-filters-title">Filters</div>
          <div className="browse-filter-controls">
            <SortPicker className="narrow-only" value={sortBy} onChange={sortFromPanel}/>
            <AgeRange
              min={draft.minAge}
              max={draft.maxAge}
              onChange={({ min, max }) => setDraft(d => ({ ...d, minAge: min, maxAge: max }))}
            />
            <FameRange
              min={draft.minFame}
              max={draft.maxFame}
              onChange={({ min, max }) => setDraft(d => ({ ...d, minFame: min, maxFame: max }))}
            />
            <DistanceRadar value={draft.maxDistance} onChange={km => setDraft(d => ({ ...d, maxDistance: km }))}/>
          </div>
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

      <div className="browse-body">
        <div className="browse-stack">
          {popId !== null && (
            <div key={popId} className="cup-pop">
              <MatchaCup size={110} mood="love" animate={false}/>
            </div>
          )}
          {loading ? (
            <CupLoading mood="searching" size={60}>Finding people nearby…</CupLoading>
          ) : currentProfile ? (
            <>
              <ProfileCard
                profile={currentProfile}
                drag={drag}
                isDragging={isDragging}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onLike={handleAction}
                onOpenProfile={p => navigate(`/profile/${p.user_id}`)}
              />

              <div className="browse-hint" style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>
                {sorted.length}{hasMore ? '+' : ''}
                {' in your stack'}{activeFilters ? ' · filtered' : ''} · drag the card or use the buttons
              </div>

              {sorted.length > 1 && (
                <div className="browse-next desktop-only">
                  <div className="browse-next-title">Coming up</div>
                  <div className="browse-next-list">
                    {sorted.slice(1, 1 + COMING_UP).map(p => {
                      const name = displayName(p, 'Unknown');
                      const photo = p.photos?.[0]?.url;
                      return (
                        <button
                          key={p.user_id}
                          type="button"
                          className="browse-next-item"
                          aria-label={`Open ${name}'s full profile`}
                          onClick={() => navigate(`/profile/${p.user_id}`)}
                        >
                          <span className="browse-next-photo" style={photo ? { backgroundImage: `url(${photo})` } : undefined}/>
                          <span className="browse-next-name">{name}{p.age ? `, ${p.age}` : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : loadError ? (
            <LoadError onRetry={() => loadPage(true)}>{loadError}</LoadError>
          ) : (
            <CupMessage mood="sleepy" size={80} title="That's everyone for now.">Check back later — new people join every day.</CupMessage>
          )}
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
