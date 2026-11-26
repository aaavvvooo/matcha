import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { search, getAllTags } from '../../api/profilesApi';
import FameMeter from '../../components/ui/FameMeter';
import CupMessage from '../../components/ui/CupMessage';
import Chip from '../../components/ui/Chip';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';
import AgeRange from '../../components/filters/AgeRange';
import DistanceRadar from '../../components/filters/DistanceRadar';
import FameRange from '../../components/filters/FameRange';
import SortPicker from '../../components/filters/SortPicker';
import { SORTS } from '../../components/filters/sorts';
import { filterErrors } from '../../utils/formValidation';
import { usePageHeader } from '../../context/HeaderContext';
import { displayName } from '../../utils/displayName';
import { apiError } from '../../api/errors';
import './SearchPage.css';

const PAGE_SIZE = 50;
const MAX_OFFSET = 1000; // server bound (DiscoveryQuery.offset)

const PAGE_HEADER = { title: 'Find someone' };

const num = v => (v === '' || v == null ? undefined : Number(v));

function ResultCard({ profile }) {
  const name = displayName(profile, 'Unknown');
  const photo = profile.photos?.[0]?.url;
  return (
    <Link to={`/profile/${profile.user_id}`} className="result-card list-card">
      <span className="result-photo">
        {photo ? <img src={photo} alt="" loading="lazy"/> : <span aria-hidden="true">{name[0]}</span>}
        {profile.is_online && <span className="result-online">online</span>}
      </span>
      <span className="result-text">
        <span className="result-name">{name}{profile.age ? `, ${profile.age}` : ''}</span>
        <span className="result-meta">
          {profile.distance_km ? `${profile.distance_km.toFixed(0)} km · ` : ''}{profile.location_label || ''}
        </span>
        <span className="result-tags">
          {(profile.tags || []).slice(0, 3).map(t => <span key={t} className="result-tag">#{t}</span>)}
        </span>
      </span>
      <FameMeter score={profile.fame_rating || 0}/>
    </Link>
  );
}

// Desktop shows the filters and the results side by side (index.css breakpoint).
const SIDE_BY_SIDE = '(min-width: 860px)';

export default function SearchPage() {
  usePageHeader(PAGE_HEADER);
  const [filters, setFilters] = useState({ ageMin: '', ageMax: '', fameMin: '', fameMax: '', maxDistance: '', tags: [], location: '' });
  const [sortBy, setSortBy] = useState('score');
  const [allTags, setAllTags] = useState([]);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tagsError, setTagsError] = useState(false);
  // Only the latest request may update the results (sort can change mid-flight).
  const requestRef = useRef(0);
  const appliedRef = useRef(null);

  // The sliders are always in range; only the tags can break a server bound.
  const searchErrors = filterErrors({ tags: filters.tags });
  const searchValid = Object.keys(searchErrors).length === 0;

  const toggleTag = t => setFilters(f => ({
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
  }));

  useEffect(() => {
    getAllTags().then(setAllTags).catch(() => setTagsError(true));
  }, []);

  // offset 0 starts a new result list; a later offset appends the next page. Sorting and paging
  // keep the filters of the results on screen; only a new search applies the edited ones.
  async function runSearch({ sort = sortBy, offset = 0, applied = filters } = {}) {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = {
        sort_by: sort,
        min_age: num(applied.ageMin),
        max_age: num(applied.ageMax),
        min_fame: num(applied.fameMin),
        max_fame: num(applied.fameMax),
        max_distance_km: num(applied.maxDistance),
        tags: applied.tags.join(',') || undefined,
        location: applied.location.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      };
      const data = await search(params);
      if (request !== requestRef.current) return;
      // The sort chip only switches once results in that order are shown.
      setSortBy(sort);
      appliedRef.current = applied;
      setResults(prev => {
        if (offset === 0 || !prev) return data;
        const seen = new Set(prev.map(p => p.user_id));
        return [...prev, ...data.filter(p => !seen.has(p.user_id))];
      });
      setHasMore(data.length === PAGE_SIZE && offset + PAGE_SIZE <= MAX_OFFSET);
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(apiError(err, 'Search failed — try again'));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  // Side by side, an empty results half would say nothing: start with everyone nearby.
  useEffect(() => {
    if (window.matchMedia(SIDE_BY_SIDE).matches) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, with the initial filters
  }, []);

  function changeSort(key) {
    runSearch({ sort: key, applied: appliedRef.current ?? filters });
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div className={`search-layout${results ? ' search-layout--results' : ''}`}>
        <div className="search-form">

          <div className="search-section">
            <AgeRange
              min={filters.ageMin}
              max={filters.ageMax}
              onChange={({ min, max }) => setFilters(f => ({ ...f, ageMin: min, ageMax: max }))}
            />
          </div>

          <div className="search-section">
            <FameRange
              min={filters.fameMin}
              max={filters.fameMax}
              onChange={({ min, max }) => setFilters(f => ({ ...f, fameMin: min, fameMax: max }))}
            />
          </div>

          {/* Location */}
          <div className="search-section">
            <FormInput
              label="Location"
              value={filters.location}
              onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
              placeholder="City or neighbourhood (default: your location)"
            />
            <div style={{ marginTop: 20 }}>
              <DistanceRadar value={filters.maxDistance} onChange={km => setFilters(f => ({ ...f, maxDistance: km }))}/>
            </div>
          </div>

          {/* Tags */}
          <div className="search-section">
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Interests</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tagsError && (
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Interest tags couldn't be loaded — reload the page to filter by tags.</div>
              )}
              {allTags.map(t => (
                <Chip
                  key={t.id}
                  label={`#${t.name}`}
                  active={filters.tags.includes(t.name)}
                  aria-pressed={filters.tags.includes(t.name)}
                  onClick={() => toggleTag(t.name)}
                />
              ))}
            </div>
            <div aria-live="polite" style={{ fontSize: 12, color: 'var(--danger-fg)', marginTop: 8 }}>{searchErrors.tags || ''}</div>
          </div>

          {error && <div role="alert" className="mobile-only" style={{ fontSize: 13, color: 'var(--rose)' }}>{error}</div>}
          <div className="search-submit">
            <Btn onClick={() => runSearch()} disabled={loading || !searchValid} style={{ width: '100%' }}>
              {loading ? 'Searching…' : 'Search →'}
            </Btn>
          </div>
        </div>

        <div className="search-results">
          <div className="search-summary">
            <div style={{ fontSize: 14, color: 'var(--ink3)', fontStyle: 'italic' }}>{loading || !results ? (error ? '' : 'Searching…') : `${results.length}${hasMore ? '+' : ''} results`}</div>
            <button className="mobile-only" onClick={() => { requestRef.current += 1; setLoading(false); setResults(null); setError(null); }} style={{ background: 'none', border: 'none', color: 'var(--spice)', fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
              ← Edit search
            </button>
          </div>

          <SortPicker className="mobile-only search-sort-picker" value={sortBy} onChange={changeSort}/>
          <div className="search-sorts desktop-only">
            {SORTS.map(([key, label]) => (
              <Chip key={key} label={label} active={sortBy === key} aria-pressed={sortBy === key} onClick={() => changeSort(key)}/>
            ))}
          </div>
          {error && <div role="alert" style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</div>}

          {!results ? null : results.length === 0 ? (
            <CupMessage mood="searching" title="No matches found">Try broadening your filters</CupMessage>
          ) : (
            <div className="search-grid">
              {results.map(p => <ResultCard key={p.user_id} profile={p}/>)}
            </div>
          )}
          {hasMore && results?.length > 0 && (
            <Btn variant="secondary" onClick={() => runSearch({ offset: results.length, applied: appliedRef.current })} disabled={loading} style={{ width: '100%', marginTop: 6 }}>
              {loading ? 'Loading…' : 'Load more'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
