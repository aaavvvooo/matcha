import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { search, getAllTags } from '../../api/profilesApi';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Chip from '../../components/ui/Chip';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';
import { displayName } from '../../utils/displayName';

const SORTS = [['score', 'best match'], ['distance', 'distance'], ['age', 'age'], ['fame', 'fame'], ['tags', 'common tags']];

function apiError(err, fallback) {
  const d = err?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return d.map(e => e.msg).join('; ');
  return fallback;
}

const num = v => (v === '' || v == null ? undefined : Number(v));

export default function SearchPage() {
  const [filters, setFilters] = useState({ ageMin: '18', ageMax: '', fameMin: 0, fameMax: 100, maxDistance: '', tags: [], location: '' });
  const [sortBy, setSortBy] = useState('score');
  const [allTags, setAllTags] = useState([]);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleTag = t => setFilters(f => ({
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
  }));

  useEffect(() => {
    getAllTags().then(setAllTags).catch(() => setAllTags([]));
  }, []);

  async function runSearch(sort = sortBy) {
    setLoading(true);
    setError(null);
    try {
      const params = {
        sort_by: sort,
        min_age: num(filters.ageMin),
        max_age: num(filters.ageMax),
        min_fame: filters.fameMin > 0 ? filters.fameMin : undefined,
        max_fame: filters.fameMax < 100 ? filters.fameMax : undefined,
        max_distance_km: num(filters.maxDistance),
        tags: filters.tags.join(',') || undefined,
        location: filters.location.trim() || undefined,
        limit: 50,
        offset: 0,
      };
      setResults(await search(params));
    } catch (err) {
      setError(apiError(err, 'Search failed — try again'));
    } finally {
      setLoading(false);
    }
  }

  function changeSort(key) {
    setSortBy(key);
    runSearch(key);
  }

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', background: 'var(--white)', borderBottom: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>Find someone</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {results === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Age range */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Age range</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <FormInput
                  label="Min"
                  type="number"
                  value={filters.ageMin}
                  onChange={e => setFilters(f => ({ ...f, ageMin: e.target.value }))}
                  placeholder="18"
                  style={{ flex: 1 }}
                />
                <FormInput
                  label="Max"
                  type="number"
                  value={filters.ageMax}
                  onChange={e => setFilters(f => ({ ...f, ageMax: e.target.value }))}
                  placeholder="50"
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Fame rating */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 4 }}>Fame rating</div>
              {[['fameMin', 'min'], ['fameMax', 'max']].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink3)', minWidth: 28 }}>{label}</span>
                  <input
                    type="range" min={0} max={100} value={filters[key]}
                    aria-label={`${label} fame rating`}
                    onChange={e => {
                      const v = +e.target.value;
                      setFilters(f => key === 'fameMin'
                        ? { ...f, fameMin: Math.min(v, f.fameMax) }
                        : { ...f, fameMax: Math.max(v, f.fameMin) });
                    }}
                    style={{ flex: 1, accentColor: 'var(--spice)' }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spice)', minWidth: 28 }}>{filters[key]}</span>
                </div>
              ))}
            </div>

            {/* Location */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <FormInput
                label="Location"
                value={filters.location}
                onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
                placeholder="City or neighbourhood (default: your location)"
              />
              <FormInput
                label="Within km"
                type="number"
                value={filters.maxDistance}
                onChange={e => setFilters(f => ({ ...f, maxDistance: e.target.value }))}
                placeholder="Any distance"
                style={{ marginTop: 12 }}
              />
            </div>

            {/* Tags */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Interests</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allTags.map(t => <Chip key={t.id} label={`#${t.name}`} active={filters.tags.includes(t.name)} onClick={() => toggleTag(t.name)}/>)}
              </div>
            </div>

            {error && <div role="alert" style={{ fontSize: 13, color: 'var(--rose)' }}>{error}</div>}
            <Btn onClick={() => runSearch()} disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Searching…' : 'Search →'}
            </Btn>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: 'var(--ink3)', fontStyle: 'italic' }}>{loading ? 'Searching…' : `${results.length} results`}</div>
              <button onClick={() => { setResults(null); setError(null); }} style={{ background: 'none', border: 'none', color: 'var(--spice)', fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
                ← Edit search
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {SORTS.map(([key, label]) => (
                <Chip key={key} label={label} active={sortBy === key} onClick={() => changeSort(key)}/>
              ))}
            </div>
            {error && <div role="alert" style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{error}</div>}

            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <SearchIcon size={36} strokeWidth={1.5} color="var(--sand)" style={{ marginBottom: 12 }}/>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--ink2)' }}>No matches found</div>
                <div style={{ fontSize: 14, color: 'var(--ink4)', marginTop: 8 }}>Try broadening your filters</div>
              </div>
            ) : (
              results.map(p => {
                const name = displayName(p, 'Unknown');
                return (
                  <div key={p.user_id} onClick={() => navigate(`/profile/${p.user_id}`)} style={{
                    padding: '14px 16px', marginBottom: 10,
                    background: 'var(--white)', borderRadius: 'var(--r-md)',
                    border: '1.5px solid var(--cream3)',
                    display: 'flex', gap: 14, alignItems: 'center',
                    cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                  }}>
                    <Avatar name={name} size={48} online={p.is_online}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                        {name}{p.age ? `, ${p.age}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                        {p.distance_km ? `${p.distance_km.toFixed(0)} km · ` : ''}{p.location_label || ''}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {(p.tags || []).slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--cream2)', color: 'var(--ink3)', border: '1px solid var(--sand)' }}>#{t}</span>
                        ))}
                      </div>
                    </div>
                    <FameMeter score={p.fame_rating || 0}/>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
