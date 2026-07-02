import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkle } from 'lucide-react';
import MatchaCup from '../../components/ui/MatchaCup';
import Btn from '../../components/ui/Btn';
import { setProfile, getAllTags } from '../../api/profilesApi';
import { useAuth } from '../../context/AuthContext';

const STEPS = [
  { title: 'When were you born?', subtitle: 'You must be 18 or older to use Matcha.' },
  { title: 'Who are you?', subtitle: 'This helps us show you to the right people.' },
  { title: 'Who interests you?', subtitle: 'You can always change this later.' },
  { title: 'Your story.', subtitle: 'Make it yours. Keep it real.' },
  { title: 'Your interests.', subtitle: 'Pick at least 3 to get better matches.' },
];

function ProfileSetupPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ birth_date: '', gender: '', sexual_orientation: '', bio: '', tags: [] });
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    getAllTags().then(setAvailableTags).catch(() => {});
  }, []);

  async function handleComplete() {
    setLoading(true);
    setError(null);
    try {
      await setProfile({
        bio: data.bio,
        gender: data.gender,
        birth_date: data.birth_date ? new Date(data.birth_date).toISOString() : null,
        sexual_orientation: data.sexual_orientation,
        tags: data.tags,
      });
      navigate('/browse');
    } catch (e) {
      setError(e?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const OptionBtn = ({ selected, onClick, children }) => (
    <button onClick={onClick} style={{
      padding: '15px 20px',
      textAlign: 'left',
      background: selected ? 'var(--spice)' : 'var(--white)',
      border: `1.5px solid ${selected ? 'var(--spice)' : 'var(--sand)'}`,
      borderRadius: 'var(--r-md)',
      color: selected ? '#fff' : 'var(--ink2)',
      fontSize: 15,
      fontWeight: selected ? 500 : 400,
      cursor: 'pointer',
      transition: 'all .18s',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {children}
      {selected && <Check size={16}/>}
    </button>
  );

  return (
    <div className="screen" style={{ height: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MatchaCup size={26} mood="happy" animate={false}/>Matcha
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i <= step ? 'var(--spice)' : 'var(--sand)',
              transition: 'all .3s',
            }}/>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: '0.08em', marginBottom: 8 }}>
          STEP {step + 1} / {STEPS.length}
        </div>
        <div style={{ fontFamily: 'Playfair Display, serif', fontStyle: 'italic', fontSize: 30, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.1 }}>
          {STEPS[step].title}
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink3)', marginTop: 6 }}>{STEPS[step].subtitle}</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {step === 0 && (
          <input
            type="date"
            value={data.birth_date}
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
            onChange={e => setData(d => ({ ...d, birth_date: e.target.value }))}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'var(--white)',
              border: '1.5px solid var(--sand)',
              borderRadius: 'var(--r-md)',
              color: data.birth_date ? 'var(--ink)' : 'var(--ink4)',
              fontSize: 15,
              fontFamily: 'DM Sans, sans-serif',
              boxSizing: 'border-box',
            }}
          />
        )}

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Man', 'Woman', 'Non-binary', 'Other'].map(g => (
              <OptionBtn key={g} selected={data.gender === g} onClick={() => setData(d => ({ ...d, gender: g }))}>
                {g}
              </OptionBtn>
            ))}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['Heterosexual', 'Homosexual', 'Bisexual', 'Other'].map(p => (
              <OptionBtn
                key={p}
                selected={data.sexual_orientation === p}
                onClick={() => setData(d => ({ ...d, sexual_orientation: p }))}
              >
                {p}
              </OptionBtn>
            ))}
            <div style={{ fontSize: 12, color: 'var(--ink4)', marginTop: 4 }}>We respect all orientations.</div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={data.bio}
              onChange={e => setData(d => ({ ...d, bio: e.target.value.slice(0, 300) }))}
              placeholder="What makes you, you?"
              rows={5}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--white)',
                border: '1.5px solid var(--sand)',
                borderRadius: 'var(--r-md)',
                color: 'var(--ink)',
                fontSize: 15,
                resize: 'none',
                lineHeight: 1.6,
              }}
            />
            <div style={{ fontSize: 12, color: data.bio.length > 260 ? 'var(--rose)' : 'var(--ink4)', textAlign: 'right' }}>
              {data.bio.length}/300
            </div>
            <div style={{
              padding: '12px 14px',
              background: 'var(--cream2)',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              color: 'var(--ink3)',
              border: '1px solid var(--sand)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkle size={13} style={{ flexShrink: 0 }}/> Tip: Keep it honest. The best bios are 1–2 sentences that actually sound like you.
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setData(d => ({
                    ...d,
                    tags: d.tags.includes(tag.id) ? d.tags.filter(t => t !== tag.id) : [...d.tags, tag.id],
                  }))}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--r-full)',
                    background: data.tags.includes(tag.id) ? 'var(--spice)' : 'var(--white)',
                    border: `1.5px solid ${data.tags.includes(tag.id) ? 'var(--spice)' : 'var(--sand)'}`,
                    color: data.tags.includes(tag.id) ? '#fff' : 'var(--ink2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all .18s',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink4)' }}>{data.tags.length} selected · min 3</div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff0f0', border: '1px solid var(--rose)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--rose)' }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 24px 28px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {step > 0 && (
          <Btn variant="secondary" onClick={() => setStep(s => s - 1)} style={{ flex: 1 }}>← Back</Btn>
        )}
        <Btn
          onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleComplete()}
          style={{ flex: 2 }}
          disabled={
            loading ||
            (step === 0 && !data.birth_date) ||
            (step === 1 && !data.gender) ||
            (step === 2 && !data.sexual_orientation) ||
            (step === 4 && data.tags.length < 3)
          }
        >
          {loading ? 'Saving...' : step < STEPS.length - 1 ? 'Continue →' : 'Finish setup →'}
        </Btn>
      </div>
    </div>
  );
}

export default ProfileSetupPage;
