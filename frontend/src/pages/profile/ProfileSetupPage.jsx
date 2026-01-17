import { useState } from 'react';
import './ProfileSetupPage.css';

function ProfileSetupPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    sexualPreference: '',
    biography: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Profile data:', formData);
    // TODO: отправить данные на backend
  };

  return (
    <div className="profile-setup-page">
      <div className="container">
        <div className="setup-header">
          <h1>Complete Your Profile</h1>
          <p>Step 1 of 3: Basic Information</p>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="firstName">First Name *</label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="lastName">Last Name *</label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="gender">Gender *</label>
            <select
              id="gender"
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              required
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="sexualPreference">Sexual Preference *</label>
            <select
              id="sexualPreference"
              name="sexualPreference"
              value={formData.sexualPreference}
              onChange={handleChange}
              required
            >
              <option value="">Select preference</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="biography">Biography *</label>
            <textarea
              id="biography"
              name="biography"
              value={formData.biography}
              onChange={handleChange}
              placeholder="Tell us about yourself..."
              rows="6"
              maxLength="500"
              required
            />
            <span className="char-count">
              {formData.biography.length}/500 characters
            </span>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary">
              Next Step
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProfileSetupPage;
