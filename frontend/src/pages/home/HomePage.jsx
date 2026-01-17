import './HomePage.css';

function HomePage() {
  return (
    <div className="home-page">
      <section className="hero">
        <div className="container">
          <h1>Find Your Perfect Match</h1>
          <p>Connect with people who share your interests and values</p>
          <div className="hero-actions">
            <button className="btn-primary">Get Started</button>
            <button className="btn-secondary">Learn More</button>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>How It Works</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📝</div>
              <h3>Create Profile</h3>
              <p>Sign up and complete your profile with photos and interests</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Browse Matches</h3>
              <p>Discover people based on your preferences and location</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3>Start Chatting</h3>
              <p>Connect and chat with your matches in real-time</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <h2>Ready to Find Love?</h2>
          <p>Join thousands of people finding meaningful connections</p>
          <button className="btn-primary">Join Now</button>
        </div>
      </section>
    </div>
  );
}

export default HomePage;
