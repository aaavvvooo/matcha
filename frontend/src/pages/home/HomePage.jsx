import { useNavigate } from 'react-router-dom';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import Avatar from '../../components/ui/Avatar';
import FameMeter from '../../components/ui/FameMeter';

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

const STATS = [
  ['2,847', 'members'],
  ['94%', 'find a match'],
  ['12 min', 'avg reply time'],
];

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

      {/* Navbar */}
      <div style={{
        padding: '18px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--white)',
        borderBottom: '1.5px solid var(--cream3)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MatchaCup size={32} mood="happy" animate={false}/>
          Matcha
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn variant="ghost" onClick={() => navigate('/login')} style={{ fontSize: 14 }}>Sign in</Btn>
          <Btn onClick={() => navigate('/register')} style={{ fontSize: 14, padding: '10px 24px' }}>Get started</Btn>
        </div>
      </div>

      {/* Hero */}
      <div style={{
        padding: '80px 40px 60px',
        display: 'flex',
        gap: 60,
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--cream)',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', background: 'var(--spice)', opacity: .06, pointerEvents: 'none' }}/>
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 280, height: 280, borderRadius: '50%', background: 'var(--matcha)', opacity: .06, pointerEvents: 'none' }}/>

        {/* Left: text */}
        <div className="anim-up" style={{ flex: 1, maxWidth: 480 }}>
          <div style={{
            display: 'inline-block', padding: '5px 14px', borderRadius: 'var(--r-full)',
            background: 'var(--cream2)', border: '1.5px solid var(--sand)',
            fontSize: 12, color: 'var(--ink3)', marginBottom: 20, fontStyle: 'italic',
          }}>
            Because love, too, can be industrialized. ✦
          </div>

          <div style={{
            fontFamily: 'Playfair Display, serif', fontStyle: 'italic',
            fontSize: 56, fontWeight: 700, lineHeight: 1.1, color: 'var(--ink)',
            letterSpacing: '-0.02em', marginBottom: 20,
          }}>
            Find people<br/>worth your<br/><span style={{ color: 'var(--spice)' }}>time.</span>
          </div>

          <div style={{ fontSize: 17, color: 'var(--ink3)', lineHeight: 1.7, marginBottom: 36, maxWidth: 400 }}>
            No endless swiping. No gamification. Matcha connects you with people based on proximity, shared interests, and genuine compatibility.
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Btn onClick={() => navigate('/register')} style={{ fontSize: 16, padding: '15px 36px' }}>Create free account</Btn>
            <Btn variant="secondary" onClick={() => navigate('/login')} style={{ fontSize: 16, padding: '15px 28px' }}>Sign in →</Btn>
          </div>

          <div style={{ display: 'flex', gap: 32, marginTop: 40 }}>
            {STATS.map(([n, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 28, fontWeight: 700, color: 'var(--ink)' }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: floating cards */}
        <div className="anim-up" style={{ animationDelay: '.1s', position: 'relative', width: 320, height: 400, flexShrink: 0 }}>
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
                <div style={{ padding: '5px 12px', borderRadius: 'var(--r-full)', background: 'var(--spice)', color: '#fff', fontSize: 11, fontWeight: 500 }}>
                  Like ✦
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div style={{ padding: '60px 40px', background: 'var(--white)', borderTop: '1.5px solid var(--cream3)', flexShrink: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <MatchaCup size={56} mood="happy" animate={true} style={{ margin: '0 auto 12px', animation: 'float 3s ease-in-out infinite' }}/>
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
        <div style={{ fontSize: 15, color: 'var(--ink3)', marginBottom: 28 }}>Join 2,847 people already on Matcha.</div>
        <Btn onClick={() => navigate('/register')} style={{ fontSize: 16, padding: '15px 40px' }}>Create your account →</Btn>
      </div>

      {/* Footer */}
      <div style={{ padding: '24px 40px', background: 'var(--white)', borderTop: '1.5px solid var(--cream3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 18, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MatchaCup size={24} mood="happy" animate={false}/>
          Matcha
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink4)' }}>© 2026 · Because love, too, can be industrialized.</div>
      </div>
    </div>
  );
}

export default HomePage;
