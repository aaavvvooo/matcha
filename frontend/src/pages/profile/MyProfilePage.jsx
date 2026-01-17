import { Link } from 'react-router-dom';
import './MyProfilePage.css';

function MyProfilePage() {
  // TODO: Получить данные профиля из backend
  const profileData = {
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    gender: 'Male',
    sexualPreference: 'Female',
    biography: 'Love hiking, photography, and meeting new people!',
    fameRating: 85,
    location: 'Yerevan, Armenia',
    photos: [],
    tags: ['hiking', 'photography', 'travel', 'music']
  };

  return (
    <div className="my-profile-page">
      <div className="container">
        <div className="profile-header">
          <h1>My Profile</h1>
          <Link to="/profile/edit" className="btn-edit">Edit Profile</Link>
        </div>

        <div className="profile-content">
          <div className="profile-main">
            <div className="profile-photo">
              <div className="photo-placeholder">
                <span>No Photo</span>
              </div>
            </div>

            <div className="profile-info">
              <h2>{profileData.firstName} {profileData.lastName}</h2>
              <p className="username">@{profileData.username}</p>
              
              <div className="info-row">
                <span className="label">Gender:</span>
                <span className="value">{profileData.gender}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Preference:</span>
                <span className="value">{profileData.sexualPreference}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Location:</span>
                <span className="value">{profileData.location}</span>
              </div>
              
              <div className="info-row">
                <span className="label">Fame Rating:</span>
                <span className="value fame-rating">{profileData.fameRating}%</span>
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3>About Me</h3>
            <p>{profileData.biography}</p>
          </div>

          <div className="profile-section">
            <h3>Interests</h3>
            <div className="tags">
              {profileData.tags.map((tag, index) => (
                <span key={index} className="tag">#{tag}</span>
              ))}
            </div>
          </div>

          <div className="profile-stats">
            <Link to="/profile/viewers" className="stat-card">
              <div className="stat-number">24</div>
              <div className="stat-label">Profile Views</div>
            </Link>
            
            <Link to="/profile/liked-by" className="stat-card">
              <div className="stat-number">12</div>
              <div className="stat-label">Likes Received</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MyProfilePage;
