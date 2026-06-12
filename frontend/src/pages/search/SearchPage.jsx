import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { search } from '../../api/profilesApi';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import Chip from '../../components/ui/Chip';
import Btn from '../../components/ui/Btn';
import FormInput from '../../components/ui/FormInput';

const TAGS = ['#photography', '#music', '#cooking', '#travel', '#reading', '#cycling', '#art', '#tech', '#yoga', '#film', '#plants', '#coffee'];

export default function SearchPage() {
  const [filters, setFilters] = useState({ ageMin: 18, ageMax: 35, fameMin: 0, tags: [], location: '' });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const toggleTag = t => setFilters(f => ({
    ...f,
    tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
  }));

  async function runSearch() {
    setLoading(true);
    try {
      const params = {
        age_min: filters.ageMin,
        age_max: filters.ageMax,
        fame_min: filters.fameMin,
        tags: filters.tags.map(t => t.replace('#', '')).join(',') || undefined,
        location: filters.location || undefined,
        limit: 30,
        offset: 0,
      };
      const data = await search(params);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
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
                  onChange={e => setFilters(f => ({ ...f, ageMin: +e.target.value }))}
                  placeholder="18"
                  style={{ flex: 1 }}
                />
                <FormInput
                  label="Max"
                  type="number"
                  value={filters.ageMax}
                  onChange={e => setFilters(f => ({ ...f, ageMax: +e.target.value }))}
                  placeholder="50"
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            {/* Fame rating */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 4 }}>Minimum fame rating</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range" min={0} max={100} value={filters.fameMin}
                  onChange={e => setFilters(f => ({ ...f, fameMin: +e.target.value }))}
                  style={{ flex: 1, accentColor: 'var(--spice)' }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--spice)', minWidth: 28 }}>{filters.fameMin}</span>
              </div>
            </div>

            {/* Location */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <FormInput
                label="Location"
                value={filters.location}
                onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
                placeholder="City or neighbourhood"
              />
            </div>

            {/* Tags */}
            <div style={{ background: 'var(--white)', borderRadius: 'var(--r-md)', padding: 16, border: '1.5px solid var(--cream3)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink2)', marginBottom: 12 }}>Interests</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {TAGS.map(t => <Chip key={t} label={t} active={filters.tags.includes(t)} onClick={() => toggleTag(t)}/>)}
              </div>
            </div>

            <Btn onClick={runSearch} disabled={loading} style={{ width: '100%' }}>
              {loading ? 'Searching…' : 'Search →'}
            </Btn>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: 'var(--ink3)', fontStyle: 'italic' }}>{results.length} results</div>
              <button onClick={() => setResults(null)} style={{ background: 'none', border: 'none', color: 'var(--spice)', fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'DM Sans, sans-serif' }}>
                ← Edit search
              </button>
            </div>

            {results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, color: 'var(--ink2)' }}>No matches found</div>
                <div style={{ fontSize: 14, color: 'var(--ink4)', marginTop: 8 }}>Try broadening your filters</div>
              </div>
            ) : (
              results.map(p => {
                const name = p.full_name || p.username || 'Unknown';
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
                        {p.distance_km ? `${p.distance_km.toFixed(1)}km · ` : ''}{p.location_label || ''}
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
