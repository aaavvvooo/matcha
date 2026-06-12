import { useState } from 'react'
import { Link } from 'react-router-dom'
import { search } from '../../api/profilesApi'
import { likeUser, unlikeUser } from '../../api/usersApi'
import './SearchPage.css'

const GENDER_OPTIONS = ['', 'male', 'female', 'non-binary', 'other']
const PREF_OPTIONS = ['', 'male', 'female', 'both']

export default function SearchPage() {
  const [filters, setFilters] = useState({
    gender: '',
    sexual_preference: '',
    min_age: '',
    max_age: '',
    min_fame: '',
    max_fame: '',
    tags: '',
    location: '',
  })
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)
  const [likedSet, setLikedSet] = useState(new Set())

  function set(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  async function handleSearch(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSearched(true)
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== '')
    )
    try {
      const data = await search(params)
      setResults(data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function toggleLike(userId) {
    try {
      if (likedSet.has(userId)) {
        await unlikeUser(userId)
        setLikedSet(prev => { const s = new Set(prev); s.delete(userId); return s })
      } else {
        await likeUser(userId)
        setLikedSet(prev => new Set(prev).add(userId))
      }
    } catch {}
  }

  return (
    <div className="search-page">
      <div className="container">
        <h1 className="search-title">Search</h1>

        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-fields">
            <div className="form-group">
              <label>Gender</label>
              <select value={filters.gender} onChange={e => set('gender', e.target.value)}>
                {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o || 'Any'}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Preference</label>
              <select value={filters.sexual_preference} onChange={e => set('sexual_preference', e.target.value)}>
                {PREF_OPTIONS.map(o => <option key={o} value={o}>{o || 'Any'}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Min age</label>
              <input type="number" min="18" max="100" placeholder="18"
                value={filters.min_age} onChange={e => set('min_age', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Max age</label>
              <input type="number" min="18" max="100" placeholder="99"
                value={filters.max_age} onChange={e => set('max_age', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Min fame</label>
              <input type="number" min="0" max="100" placeholder="0"
                value={filters.min_fame} onChange={e => set('min_fame', e.target.value)} />
            </div>

            <div className="form-group">
              <label>Max fame</label>
              <input type="number" min="0" max="100" placeholder="100"
                value={filters.max_fame} onChange={e => set('max_fame', e.target.value)} />
            </div>

            <div className="form-group search-tags-field">
              <label>Tags (comma-separated)</label>
              <input type="text" placeholder="hiking, music, travel"
                value={filters.tags} onChange={e => set('tags', e.target.value)} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>

        {error && <p className="error-msg">{error}</p>}

        {searched && !loading && (
          <>
            <p className="search-count">
              {results.length === 0 ? 'No results found.' : `${results.length} profile${results.length !== 1 ? 's' : ''} found`}
            </p>
            <div className="search-results">
              {results.map(p => {
                const photo = p.photos?.[0]?.url
                const liked = likedSet.has(p.user_id)
                return (
                  <div key={p.user_id} className="result-card">
                    <Link to={`/users/${p.user_id}`} className="result-photo-wrap">
                      {photo
                        ? <img src={photo} alt={p.username} className="result-photo" />
                        : <div className="result-photo-placeholder">No photo</div>
                      }
                    </Link>
                    <div className="result-info">
                      <div className="result-name">
                        <Link to={`/users/${p.user_id}`}>{p.full_name || p.username}</Link>
                        {p.is_online && <span className="online-dot" />}
                      </div>
                      {p.location_label && <p className="result-location">{p.location_label}</p>}
                      {p.bio && <p className="result-bio">{p.bio}</p>}
                      {p.tags?.length > 0 && (
                        <div className="card-tags">
                          {p.tags.slice(0, 5).map(t => <span key={t} className="tag">#{t}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="result-actions">
                      <span className="fame-badge">{Math.round(p.fame_rating ?? 0)} fame</span>
                      <button
                        className={`btn-like${liked ? ' liked' : ''}`}
                        onClick={() => toggleLike(p.user_id)}
                      >
                        {liked ? '♥' : '♡'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
