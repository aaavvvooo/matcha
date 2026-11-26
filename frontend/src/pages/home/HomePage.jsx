import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sparkle } from 'lucide-react';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';
import './HomePage.css';

const PREVIEW_CARDS = [
  { name: 'Aiko',  age: 24, tag: '#neuroscience', bio: 'Research neuroscience. Read sci-fi.', fame: 95, dx: -30, dy: -20, rot: -6, z: 1 },
  { name: 'Marco', age: 29, tag: '#bread',        bio: 'Sourdough scientist by night.',       fame: 92, dx: 30,  dy: 20,  rot: 5,  z: 2 },
  { name: 'Léa',   age: 26, tag: '#photography',  bio: 'Caffeine dependency & too many plants.', fame: 87, dx: 0, dy: 0, rot: -1, z: 3 },
];

const FEATURES = [
  { n: '01', title: 'Create your profile', desc: 'Add photos, write your bio, pick interest tags. Takes 3 minutes.' },
  { n: '02', title: 'Discover matches',    desc: 'We suggest people nearby who share your interests and vibe.' },
  { n: '03', title: 'Like & connect',      desc: 'Like someone. If they like you back, you\'re connected.' },
  { n: '04', title: 'Start talking',       desc: 'Chat in real-time. No timer, no pressure. Just conversation.' },
];

// Product facts only: no invented member counts or success rates.
const STATS = [
  ['5', 'photos per profile'],
  ['Mutual', 'likes to chat'],
  ['Live', 'chat & alerts'],
];

function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // The landing page is for visitors; signed-in users belong in the app, where the
  // header gives them logout and the unread indicator.
  if (user) return <Navigate to="/browse" replace />;

  return (
    <div className="screen landing" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Navbar */}
      <header className="landing-header">
        <div className="landing-brand">
          <MatchaCup size={32} mood="happy" animate={false}/>
          Matcha
        </div>
        <div className="landing-header-actions">
          <Btn variant="ghost" onClick={() => navigate('/login')} style={{ fontSize: 'var(--landing-nav-font)', padding: 'var(--landing-nav-link-pad)' }}>Sign in</Btn>
          <Btn onClick={() => navigate('/register')} style={{ fontSize: 'var(--landing-nav-font)', padding: 'var(--landing-nav-cta-pad)' }}>Get started</Btn>
        </div>
      </header>

      {/* display: contents keeps the existing flex layout while giving the page a real <main> landmark */}
      <main style={{ display: 'contents' }}>
      {/* Hero */}
      <div className="landing-hero">
        <div className="landing-hero-blob landing-hero-blob--spice"/>
        <div className="landing-hero-blob landing-hero-blob--matcha"/>

        <div className="landing-hero-inner">
          {/* Text */}
          <div className="landing-hero-text anim-up">
            <div className="landing-hero-tagline">
              Because love, too, can be industrialized. <Sparkle size={12} fill="var(--ink3)"/>
            </div>

            <div className="landing-hero-title">
              Find people<br/>worth your<br/><span style={{ color: 'var(--spice)' }}>time.</span>
            </div>

            <div className="landing-hero-lead">
              No endless swiping. No gamification. Matcha connects you with people based on proximity, shared interests, and genuine compatibility.
            </div>

            <div className="landing-hero-cta">
              <Btn onClick={() => navigate('/register')} style={{ fontSize: 16, padding: '15px 36px' }}>Create free account</Btn>
              <Btn variant="secondary" onClick={() => navigate('/login')} style={{ fontSize: 16, padding: '15px 28px' }}>Sign in →</Btn>
            </div>

            <div className="landing-hero-stats">
              {STATS.map(([n, l]) => (
                <div key={l}>
                  <div className="landing-hero-stat-value">{n}</div>
                  <div className="landing-hero-stat-label">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating cards */}
          <div className="landing-cards anim-up" style={{ animationDelay: '.1s' }}>
            <div className="landing-cards-stage">
              {PREVIEW_CARDS.map(c => (
                <div key={c.name} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translateX(calc(-50% + ${c.dx}px)) translateY(calc(-50% + ${c.dy}px)) rotate(${c.rot}deg)`,
                  zIndex: c.z,
                  background: 'var(--white)',
                  borderRadius: 20,
                  boxShadow: 'var(--shadow-lg)',
                  padding: '16px',
                  width: 200,
                  border: '1.5px solid var(--cream3)',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                    <Avatar name={c.name} size={40}/>
                    <div>
                      <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{c.name}, {c.age}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink4)' }}>{c.tag}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: 10 }}>{c.bio}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <FameMeter score={c.fame}/>
                    <div style={{ padding: '5px 12px', borderRadius: 'var(--r-full)', background: 'var(--spice)', color: '#fff', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                      Like <Sparkle size={11} fill="#fff"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '60px 40px', background: 'var(--white)', borderTop: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <MatchaCup size={56} mood="love" animate={true} style={{ margin: '0 auto 12px', animation: 'float 3s ease-in-out infinite' }}/>
          <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 36, fontWeight: 700, color: 'var(--ink)' }}>How it works</div>
          <div style={{ fontSize: 15, color: 'var(--ink3)', marginTop: 8 }}>Four steps to finding someone worth meeting.</div>
        </div>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {FEATURES.map(f => (
            <div key={f.n} style={{
              width: 200,
              padding: '24px 20px',
              background: 'var(--cream)',
              borderRadius: 'var(--r-md)',
              border: '1.5px solid var(--sand)',
            }}>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 32, fontWeight: 700, color: 'var(--spice)', opacity: .4, marginBottom: 12 }}>{f.n}</div>
              <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 17, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '60px 40px', textAlign: 'center', background: 'var(--cream2)', borderTop: '1.5px solid var(--sand)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 36, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>
          Ready to meet someone real?
        </div>
        <div style={{ fontSize: 15, color: 'var(--ink3)', marginBottom: 28 }}>Set up your profile in a few minutes.</div>
        <Btn onClick={() => navigate('/register')} style={{ fontSize: 16, padding: '15px 40px' }}>Create your account →</Btn>
      </div>

      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-brand">
          <MatchaCup size={24} mood="happy" animate={false}/>
          Matcha
        </div>
        <div className="landing-footer-note">© 2026 · Because love, too, can be industrialized.</div>
      </footer>
    </div>
  );
}

export default HomePage;
