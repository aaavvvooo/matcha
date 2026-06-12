import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { browse } from '../../api/profilesApi'
import { likeUser, unlikeUser } from '../../api/usersApi'
import './BrowsePage.css'

function ProfileCard({ profile, onLike }) {
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleLike() {
    if (busy) return
    setBusy(true)
    try {
      if (liked) {
        await unlikeUser(profile.user_id)
        setLiked(false)
      } else {
        await likeUser(profile.user_id)
        setLiked(true)
      }
      onLike?.()
    } catch {}
    finally { setBusy(false) }
  }

  const photo = profile.photos?.[0]?.url

  return (
    <div className="profile-card">
      <Link to={`/users/${profile.user_id}`} className="card-photo-wrap">
        {photo
          ? <img src={photo} alt={profile.username} className="card-photo" />
          : <div className="card-photo-placeholder">No photo</div>
        }
      </Link>
      <div className="card-body">
        <div className="card-name">
          <Link to={`/users/${profile.user_id}`}>{profile.full_name || profile.username}</Link>
          {profile.is_online && <span className="online-dot" title="Online" />}
        </div>
        {profile.location_label && (
          <p className="card-location">{profile.location_label}</p>
        )}
        {profile.tags?.length > 0 && (
          <div className="card-tags">
            {profile.tags.slice(0, 4).map(t => (
              <span key={t} className="tag">#{t}</span>
            ))}
          </div>
        )}
        <div className="card-footer">
          <span className="fame-badge">{Math.round(profile.fame_rating ?? 0)} fame</span>
          <button
            className={`btn-like${liked ? ' liked' : ''}`}
            onClick={handleLike}
            disabled={busy}
          >
            {liked ? '♥' : '♡'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BrowsePage() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const PAGE_SIZE = 12

  async function load(offset = 0, replace = false) {
    setLoading(true)
    setError(null)
    try {
      const data = await browse({ limit: PAGE_SIZE, offset })
      if (replace) setProfiles(data)
      else setProfiles(prev => [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(0, true)
  }, [])

  function loadMore() {
    const next = page + 1
    setPage(next)
    load(next * PAGE_SIZE)
  }

  return (
    <div className="browse-page">
      <div className="container">
        <div className="browse-header">
          <h1>Browse</h1>
          <Link to="/search" className="btn btn-ghost">Advanced search</Link>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="profiles-grid">
          {profiles.map(p => (
            <ProfileCard key={p.user_id} profile={p} onLike={() => {}} />
          ))}
        </div>

        {loading && (
          <div className="browse-spinner">
            <div className="status-card__spinner" />
          </div>
        )}

        {!loading && hasMore && profiles.length > 0 && (
          <div className="browse-more">
            <button className="btn btn-ghost" onClick={loadMore}>Load more</button>
          </div>
        )}

        {!loading && profiles.length === 0 && !error && (
          <p className="browse-empty">No profiles to show right now. Check back later!</p>
        )}
      </div>
    </div>
  )
}
